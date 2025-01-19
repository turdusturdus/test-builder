#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import parser from '@babel/parser';
import _traverse from '@babel/traverse'; // don't remove this comment and don't change the way traverse and generate is imported
const traverse = _traverse.default;
import _generate from '@babel/generator';
const generate = _generate.default;
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as t from '@babel/types'; // **Added Import for Babel Types**
import prettier from 'prettier'; // **Imported Prettier**

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

// **Revised Function to Override or Add setPageInteraction**
async function overrideSetPageInteraction(
  filePath,
  selectedVariant,
  newInteractionCode
) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'dynamicImport'],
  });

  let variantFound = false;
  let currentVariant = 'main'; // Initialize currentVariant

  traverse(ast, {
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
          // Check if current variant matches
          if (currentVariant === selectedVariant) {
            // **Parse Only the Arrow Function Body**
            const functionAst = parser.parse(
              `async (page) => { ${newInteractionCode} }`,
              { sourceType: 'module' }
            ).program.body[0].expression;

            // **Programmatically Build the .setPageInteraction(...) Call**
            const newCallExpression = t.callExpression(
              t.memberExpression(
                callee.object, // The preceding chain, e.g., the `.test('variantName')`
                t.identifier('setPageInteraction')
              ),
              [functionAst]
            );

            // **Replace the Existing setPageInteraction Call with the New One**
            path.replaceWith(newCallExpression);

            variantFound = true;
            path.stop(); // Exit traversal once replaced
          }
        }
      }
    },
  });

  if (!variantFound) {
    console.log(
      chalk.yellow(
        `No setPageInteraction found for variant "${selectedVariant}". Adding a new one.`
      )
    );

    // **To Add a New setPageInteraction for the Variant, Modify the Existing Method Chain**
    traverse(ast, {
      CallExpression(path) {
        const callee = path.node.callee;

        if (callee.type === 'MemberExpression') {
          const methodName = callee.property.name;

          if (methodName === 'test') {
            const args = path.node.arguments;
            let variantName = 'main';
            if (
              args.length > 0 &&
              args[0].type === 'StringLiteral' &&
              args[0].value !== ''
            ) {
              variantName = args[0].value;
            }

            // Check if the current test() corresponds to the selectedVariant
            if (
              (selectedVariant === 'main' && args.length === 0) ||
              args[0].value === selectedVariant
            ) {
              // **Parse Only the Arrow Function Body**
              const functionAst = parser.parse(
                `async (page) => { ${newInteractionCode} }`,
                { sourceType: 'module' }
              ).program.body[0].expression;

              // **Programmatically Build the .setPageInteraction(...) Call**
              const setPageInteractionCall = t.callExpression(
                t.memberExpression(
                  callee.object, // The preceding chain, e.g., the `.test('variantName')`
                  t.identifier('setPageInteraction')
                ),
                [functionAst]
              );

              // **Modify the Current .test(...) Call to Include .setPageInteraction(...) Before It**
              path.node.callee.object = setPageInteractionCall;

              variantFound = true;
              path.stop(); // Exit traversal once added
            }
          }
        }
      },
    });

    if (!variantFound && selectedVariant === 'main') {
      // **Special Handling for 'main' Variant: Insert setPageInteraction Before the First test() Call**
      traverse(ast, {
        ExpressionStatement(path) {
          const expression = path.node.expression;

          if (
            expression.type === 'CallExpression' &&
            expression.callee.type === 'MemberExpression' &&
            expression.callee.object.type === 'NewExpression' &&
            expression.callee.object.callee.name === 'ScreenshotTest'
          ) {
            // **Parse Only the Arrow Function Body**
            const functionAst = parser.parse(
              `async (page) => { ${newInteractionCode} }`,
              { sourceType: 'module' }
            ).program.body[0].expression;

            // **Programmatically Build the .setPageInteraction(...) Call**
            const setPageInteractionCall = t.callExpression(
              t.memberExpression(
                expression, // The preceding chain, e.g., `new ScreenshotTest().forPage('/', 'home').only()`
                t.identifier('setPageInteraction')
              ),
              [functionAst]
            );

            // **Modify the Existing Chain to Include .setPageInteraction(...) Before .test()**
            const newTestCall = t.callExpression(
              t.memberExpression(
                setPageInteractionCall, // `...setPageInteraction(...)`
                t.identifier('test')
              ),
              [t.stringLiteral('newInteraction')]
            );

            // **Replace the Existing Expression with the Modified One**
            path.replaceWith(t.expressionStatement(newTestCall));

            variantFound = true;
            path.stop(); // Exit traversal once added
          }
        },
      });
    }

    if (!variantFound) {
      console.log(
        chalk.red(
          `Failed to add setPageInteraction for variant "${selectedVariant}". Please ensure the variant exists.`
        )
      );
      return;
    }

    console.log(
      chalk.green(
        `setPageInteraction for variant "${selectedVariant}" has been added successfully.`
      )
    );
  } else {
    console.log(
      chalk.green(
        `setPageInteraction for variant "${selectedVariant}" has been overridden successfully.`
      )
    );
  }

  // Generate the modified code
  let output = generate(
    ast,
    {
      /* options */
    },
    code
  ).code;

  // **Format the code with Prettier before writing**
  try {
    const prettierConfig = await prettier.resolveConfig(filePath);
    output = await prettier.format(output, {
      ...prettierConfig,
      filepath: filePath, // Ensure Prettier uses the correct parser based on file extension
    });
    console.log(chalk.green('Code formatted with Prettier successfully.'));
  } catch (error) {
    console.log(
      chalk.red('An error occurred while formatting the code with Prettier:')
    );
    console.error(error);
    return;
  }

  // Write back to the file
  fs.writeFileSync(filePath, output, 'utf-8');
}

/**
 * Removes the setPageInteraction for a specific test variant.
 *
 * @param {string} filePath - The path to the spec file.
 * @param {string} selectedVariant - The test variant to remove the interaction from.
 */
async function removeSetPageInteraction(filePath, selectedVariant) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'dynamicImport'],
  });

  let variantFound = false;
  let currentVariant = 'main'; // Initialize currentVariant

  traverse(ast, {
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
          // Check if current variant matches
          if (currentVariant === selectedVariant) {
            // **Replace the setPageInteraction Call with its preceding chain**
            const precedingChain = callee.object;
            path.replaceWith(precedingChain);

            variantFound = true;
            path.stop(); // Exit traversal once removed
          }
        }
      }
    },
  });

  if (variantFound) {
    console.log(
      chalk.green(
        `setPageInteraction for variant "${selectedVariant}" has been removed successfully.`
      )
    );
  } else {
    console.log(
      chalk.yellow(
        `No setPageInteraction found for variant "${selectedVariant}".`
      )
    );
  }

  // Generate the modified code
  let output = generate(
    ast,
    {
      /* options */
    },
    code
  ).code;

  // Format the code with Prettier before writing
  try {
    const prettierConfig = await prettier.resolveConfig(filePath);
    output = await prettier.format(output, {
      ...prettierConfig,
      filepath: filePath, // Ensure Prettier uses the correct parser based on file extension
    });
    console.log(chalk.green('Code formatted with Prettier successfully.'));
  } catch (error) {
    console.log(
      chalk.red('An error occurred while formatting the code with Prettier:')
    );
    console.error(error);
    return;
  }

  // Write back to the file
  fs.writeFileSync(filePath, output, 'utf-8');
}

// **Function to Format File with Prettier**
async function formatFileWithPrettier(filePath) {
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    const prettierConfig = await prettier.resolveConfig(filePath);

    const formatted = await prettier.format(fileContent, {
      ...prettierConfig,
      filepath: filePath, // This ensures Prettier uses the correct parser based on file extension
    });

    await fs.promises.writeFile(filePath, formatted, 'utf-8');
    console.log(chalk.green(`Formatted ${filePath} with Prettier successfully.`));
  } catch (error) {
    console.log(
      chalk.red(`An error occurred while formatting ${filePath} with Prettier:`)
    );
    console.error(error);
  }
}

// Main function to run the CLI
async function runTestManager() {
  console.log(chalk.green('Welcome to testManager CLI!\n'));

  // Step 1: List all .spec.js files
  const testsDir = path.join(__dirname, 'tests');
  if (!fs.existsSync(testsDir)) {
    console.log(
      chalk.red(`Tests directory does not exist at path: ${testsDir}`)
    );
    return;
  }

  const specFiles = getSpecFiles(testsDir);
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

  // Step 6: Prompt for action - Override, Remove, or Do Nothing
  const { actionChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'actionChoice',
      message: 'What would you like to do with setPageInteraction?',
      choices: [
        { name: 'Override setPageInteraction', value: 'override' },
        { name: 'Remove setPageInteraction', value: 'remove' },
        { name: 'Do Nothing', value: 'nothing' },
      ],
      default: 'nothing',
    },
  ]);

  if (actionChoice === 'override') {
    // Override the setPageInteraction with contents from ./pageInteraction
    const pageInteractionPath = path.resolve(process.cwd(), 'pageInteraction');
    if (!fs.existsSync(pageInteractionPath)) {
      console.log(
        chalk.red(
          `The file ./pageInteraction does not exist at path: ${pageInteractionPath}`
        )
      );
      return;
    }

    const newInteractionCode = fs
      .readFileSync(pageInteractionPath, 'utf-8')
      .trim();

    if (!newInteractionCode) {
      console.log(
        chalk.red(
          'The ./pageInteraction file is empty. Please provide valid interaction code.'
        )
      );
      return;
    }

    // Override the setPageInteraction in the selected spec file
    await overrideSetPageInteraction(
      selectedSpecFile,
      selectedVariant,
      newInteractionCode
    );

    // Format the file with Prettier after overriding
    await formatFileWithPrettier(selectedSpecFile);
  } else if (actionChoice === 'remove') {
    // Remove the setPageInteraction for the selected variant
    await removeSetPageInteraction(selectedSpecFile, selectedVariant);

    // Format the file with Prettier after removal
    await formatFileWithPrettier(selectedSpecFile);
  } else {
    console.log(chalk.blue('No changes were made.'));
  }

  console.log(chalk.green('\nTest Manager operation completed.'));
}

runTestManager();