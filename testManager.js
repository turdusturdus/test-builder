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
import * as t from '@babel/types';
import prettier from 'prettier';
import { codegenAndExtract } from './codegen.js';

// *** ADDED: import Builder so we can read variant states ***
import Builder from './screenshot-test-builder.js';
import config from './config.js';

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

// Revised Function to Override or Add setPageInteraction
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
            // Parse only the Arrow Function Body
            const functionAst = parser.parse(
              `async (page) => { ${newInteractionCode} }`,
              { sourceType: 'module' }
            ).program.body[0].expression;

            // Programmatically build the .setPageInteraction(...) call
            const newCallExpression = t.callExpression(
              t.memberExpression(
                callee.object,
                t.identifier('setPageInteraction')
              ),
              [functionAst]
            );

            // Replace the existing setPageInteraction call
            path.replaceWith(newCallExpression);

            variantFound = true;
            path.stop();
          }
        }
      }
    },
  });

  if (!variantFound) {
    console.log(
      chalk.yellow(
        `No setPageInteraction found for variant "${selectedVariant}". Adding a new one...`
      )
    );

    // If the test with this variant exists but .setPageInteraction doesn't:
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
              // Parse only the Arrow Function Body
              const functionAst = parser.parse(
                `async (page) => { ${newInteractionCode} }`,
                { sourceType: 'module' }
              ).program.body[0].expression;

              // Programmatically build the .setPageInteraction(...) call
              const setPageInteractionCall = t.callExpression(
                t.memberExpression(
                  callee.object,
                  t.identifier('setPageInteraction')
                ),
                [functionAst]
              );

              // Insert .setPageInteraction(...) into the chain
              path.node.callee.object = setPageInteractionCall;

              variantFound = true;
              path.stop();
            }
          }
        }
      },
    });
  }

  // Generate the modified code
  let output = generate(ast, {}, code).code;

  // Format the code with Prettier before writing
  try {
    const prettierConfig = await prettier.resolveConfig(filePath);
    output = await prettier.format(output, {
      ...prettierConfig,
      filepath: filePath,
    });
    console.log(chalk.green('Code formatted with Prettier successfully.'));
  } catch (error) {
    console.log(chalk.red('Error while formatting with Prettier:'), error);
  }

  // Write back to the file
  fs.writeFileSync(filePath, output, 'utf-8');
  console.log(
    chalk.green(
      `setPageInteraction for variant "${selectedVariant}" updated/added successfully.`
    )
  );
}

/**
 * Removes the setPageInteraction for a specific test variant.
 */
async function removeSetPageInteraction(filePath, selectedVariant) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'dynamicImport'],
  });

  let variantFound = false;
  let currentVariant = 'main';

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;

      if (callee.type === 'MemberExpression') {
        const methodName = callee.property.name;

        if (methodName === 'test') {
          const args = path.node.arguments;
          if (args.length > 0 && args[0].type === 'StringLiteral') {
            currentVariant = args[0].value;
          } else {
            currentVariant = 'main';
          }
        }

        if (methodName === 'setPageInteraction') {
          if (currentVariant === selectedVariant) {
            const precedingChain = callee.object;
            path.replaceWith(precedingChain);
            variantFound = true;
            path.stop();
          }
        }
      }
    },
  });

  if (!variantFound) {
    console.log(
      chalk.yellow(
        `No setPageInteraction found for variant "${selectedVariant}".`
      )
    );
  } else {
    console.log(
      chalk.green(
        `setPageInteraction for variant "${selectedVariant}" removed successfully.`
      )
    );
  }

  let output = generate(ast, {}, code).code;
  try {
    const prettierConfig = await prettier.resolveConfig(filePath);
    output = await prettier.format(output, {
      ...prettierConfig,
      filepath: filePath,
    });
    console.log(chalk.green('Code formatted with Prettier successfully.'));
  } catch (error) {
    console.log(chalk.red('Error while formatting with Prettier:'), error);
  }

  fs.writeFileSync(filePath, output, 'utf-8');
}

// Utility function to format a file with Prettier
async function formatFileWithPrettier(filePath) {
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    const prettierConfig = await prettier.resolveConfig(filePath);

    const formatted = await prettier.format(fileContent, {
      ...prettierConfig,
      filepath: filePath,
    });

    await fs.promises.writeFile(filePath, formatted, 'utf-8');
    console.log(
      chalk.green(`Formatted ${filePath} with Prettier successfully.`)
    );
  } catch (error) {
    console.log(
      chalk.red(
        `An error occurred while formatting ${filePath} with Prettier:`
      ),
      error
    );
  }
}

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

  console.log(chalk.blue(`\nYou selected file: ${selectedSpecFile}`));
  console.log(chalk.blue(`You selected variant: ${selectedVariant}`));

  // Step 5: Extract and show existing setPageInteraction code
  const setPageInteractionCode = getSetPageInteractionCode(
    selectedSpecFile,
    selectedVariant
  );
  if (setPageInteractionCode) {
    console.log(
      chalk.green('\nCurrent setPageInteraction code for this variant:\n')
    );
    console.log(chalk.white(setPageInteractionCode));
  } else {
    console.log(chalk.yellow('\nNo setPageInteraction code currently.\n'));
  }

  // Step 6: Prompt for action
  const { actionChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'actionChoice',
      message: 'What would you like to do with setPageInteraction?',
      choices: [
        {
          name: 'Generate new code via codegen + override setPageInteraction',
          value: 'override',
        },
        { name: 'Remove setPageInteraction', value: 'remove' },
        { name: 'Do Nothing', value: 'nothing' },
      ],
      default: 'nothing',
    },
  ]);

  if (actionChoice === 'override') {
    // *** ADDED: import the spec to load the Builder state for that variant ***
    process.env.SCREENSHOT_TEST_BUILDER_CLI = 'true';
    try {
      await import(path.resolve(selectedSpecFile));
    } catch (err) {
      console.log(chalk.red('Failed to import spec file in testManager:'), err);
    }

    // *** ADDED: find the builder’s state for the selected variant ***
    let foundState = null;
    for (const instance of Builder.__instances) {
      const s = instance.getVariantState(selectedVariant);
      if (s) {
        foundState = s;
        break;
      }
    }

    // Use the route from the Builder state as default if present
    const pageUrl = config.basePageUrl + foundState?.pageRoute;

    // 2) Run codegen and retrieve code
    let newInteractionCode;
    try {
      newInteractionCode = await codegenAndExtract(pageUrl);
      console.log(
        chalk.green('\nPlaywright codegen completed. Extracted code:')
      );
      console.log(chalk.white(newInteractionCode));
    } catch (err) {
      console.log(chalk.red('Failed to run codegen:'), err);
      return;
    }

    if (!newInteractionCode) {
      console.log(chalk.red('No code was extracted. Aborting override.'));
      return;
    }

    // 2) Override the setPageInteraction in the selected spec file
    await overrideSetPageInteraction(
      selectedSpecFile,
      selectedVariant,
      newInteractionCode
    );

    // 3) Format the file with Prettier
    await formatFileWithPrettier(selectedSpecFile);

    // 4) Print out the entire changed file
    const changedFileContent = fs.readFileSync(selectedSpecFile, 'utf8');
    console.log(chalk.magenta('\n=== Updated Test File Content ==='));
    console.log(changedFileContent);
    console.log(chalk.magenta('=== End of Test File ===\n'));
  } else if (actionChoice === 'remove') {
    // Remove the setPageInteraction for the selected variant
    await removeSetPageInteraction(selectedSpecFile, selectedVariant);

    // Format the file with Prettier
    await formatFileWithPrettier(selectedSpecFile);

    // Show the entire file again
    const changedFileContent = fs.readFileSync(selectedSpecFile, 'utf8');
    console.log(chalk.magenta('\n=== Updated Test File Content ==='));
    console.log(changedFileContent);
    console.log(chalk.magenta('=== End of Test File ===\n'));
  } else {
    console.log(chalk.blue('No changes were made. Exiting.'));
  }

  console.log(chalk.green('\nTest Manager operation completed.'));
}

runTestManager();
