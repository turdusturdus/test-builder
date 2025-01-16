#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import parser from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default;
import _generate from '@babel/generator';
const generate = _generate.default;
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to get all .spec.js files recursively
function getSpecFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fileList = getSpecFiles(filePath, fileList);
    } else if (file.endsWith('.spec.js')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

// Helper function to extract test variants from a spec file
function getTestVariants(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'dynamicImport'],
  });

  const variants = [];

  traverse(ast, {
    CallExpression(path) {
      const calleeName =
        path.node.callee.name ||
        (path.node.callee.property && path.node.callee.property.name);
      if (calleeName === 'test' || calleeName === 'testFunction') {
        const args = path.node.arguments;
        if (args.length > 0 && args[0].type === 'StringLiteral') {
          variants.push(args[0].value);
        } else {
          variants.push('main');
        }
      }
    },
  });

  return [...new Set(variants)]; // Remove duplicates
}

// Function to extract setPageInteraction code for a specific variant
function getSetPageInteractionCode(filePath, selectedVariant) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'dynamicImport'],
  });

  const variantToInteraction = {};
  let currentVariant = 'main'; // Default variant

  traverse(ast, {
    // Traverse method calls in order
    CallExpression(path) {
      const callee = path.node.callee;

      // Handle chained method calls
      if (callee.type === 'MemberExpression') {
        const methodName = callee.property.name;

        if (methodName === 'test') {
          // Extract variant name
          const args = path.node.arguments;
          if (args.length > 0 && args[0].type === 'StringLiteral') {
            currentVariant = args[0].value;
          } else {
            currentVariant = 'main';
          }
        }

        if (methodName === 'setPageInteraction') {
          // Extract the interaction function
          const interactionArg = path.node.arguments[0];
          if (
            interactionArg &&
            (interactionArg.type === 'ArrowFunctionExpression' ||
              interactionArg.type === 'FunctionExpression')
          ) {
            let interactionCode = '';

            if (interactionArg.body.type === 'BlockStatement') {
              // Multiple statements
              interactionCode = interactionArg.body.body
                .map((stmt) => generate(stmt).code)
                .join('\n');
            } else {
              // Single expression
              interactionCode = generate(interactionArg.body).code;
            }

            variantToInteraction[currentVariant] = interactionCode;
          }
        }
      }
    },
  });

  // Now, retrieve the interaction for the selected variant
  const interaction = variantToInteraction[selectedVariant];

  if (interaction) {
    return interaction;
  } else {
    console.log(
      chalk.yellow('No setPageInteraction defined for this variant.')
    );
    return null;
  }
}

// Main function to run the CLI
async function runTestManager() {
  console.log(chalk.green('Welcome to testManager CLI!\n'));

  // Step 1: List all .spec.js files
  const specFiles = getSpecFiles(path.join(__dirname, 'tests'));
  if (specFiles.length === 0) {
    console.log(chalk.red('No .spec.js files found.'));
    return;
  }

  const relativeSpecFiles = specFiles.map((file) =>
    path.relative(process.cwd(), file)
  );

  // Step 2: Prompt the user to select a spec file
  const { selectedSpecFile } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedSpecFile',
      message: 'Select a test file:',
      choices: relativeSpecFiles,
    },
  ]);

  // Step 3: Extract test variants from the selected file
  const testVariants = getTestVariants(selectedSpecFile);

  if (testVariants.length === 0) {
    console.log(chalk.yellow('No test variants found.'));
    return;
  }

  // Step 4: Prompt the user to select a test variant
  const { selectedVariant } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedVariant',
      message: 'Select a test variant:',
      choices: testVariants,
    },
  ]);

  console.log(chalk.blue(`\nYou selected: ${selectedVariant}`));

  // Step 5: Extract and print the setPageInteraction code for the selected variant
  const setPageInteractionCode = getSetPageInteractionCode(
    selectedSpecFile,
    selectedVariant
  );

  if (setPageInteractionCode) {
    console.log(
      chalk.green(
        '\nDefined setPageInteraction code for the selected variant:\n'
      )
    );
    console.log(chalk.white(setPageInteractionCode));
  } else {
    console.log(chalk.yellow('No setPageInteraction code to display.'));
  }

  // You can add additional logic here, such as running the test or displaying more information.
}

runTestManager();
