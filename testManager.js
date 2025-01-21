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
import * as t from '@babel/types';
import prettier from 'prettier';
import { codegenAndExtract } from './codegen.js';
import Builder from './screenshot-test-builder.js';
import config from './config.js';
import Table from 'cli-table3';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  return [...new Set(variants)];
}

function getSetPageInteractionCode(filePath, selectedVariant) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'dynamicImport'],
  });

  const variantToInteraction = {};
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
          const interactionArg = path.node.arguments[0];
          if (
            interactionArg &&
            (interactionArg.type === 'ArrowFunctionExpression' ||
              interactionArg.type === 'FunctionExpression')
          ) {
            let interactionCode = '';

            if (interactionArg.body.type === 'BlockStatement') {
              interactionCode = interactionArg.body.body
                .map((stmt) => generate(stmt).code)
                .join('\n');
            } else {
              interactionCode = generate(interactionArg.body).code;
            }

            variantToInteraction[currentVariant] = interactionCode;
          }
        }
      }
    },
  });

  const interaction = variantToInteraction[selectedVariant];
  if (interaction) {
    return interaction;
  } else {
    return null;
  }
}

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
            const functionAst = parser.parse(
              `async (page) => { ${newInteractionCode} }`,
              { sourceType: 'module' }
            ).program.body[0].expression;

            const newCallExpression = t.callExpression(
              t.memberExpression(
                callee.object,
                t.identifier('setPageInteraction')
              ),
              [functionAst]
            );

            path.replaceWith(newCallExpression);

            variantFound = true;
            path.stop();
          }
        }
      }
    },
  });

  if (!variantFound) {
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

            if (
              (selectedVariant === 'main' && args.length === 0) ||
              args[0].value === selectedVariant
            ) {
              const functionAst = parser.parse(
                `async (page) => { ${newInteractionCode} }`,
                { sourceType: 'module' }
              ).program.body[0].expression;

              const setPageInteractionCall = t.callExpression(
                t.memberExpression(
                  callee.object,
                  t.identifier('setPageInteraction')
                ),
                [functionAst]
              );

              path.node.callee.object = setPageInteractionCall;

              variantFound = true;
              path.stop();
            }
          }
        }
      },
    });
  }

  let output = generate(ast, {}, code).code;

  try {
    const prettierConfig = await prettier.resolveConfig(filePath);
    output = await prettier.format(output, {
      ...prettierConfig,
      filepath: filePath,
    });
  } catch (error) {}

  fs.writeFileSync(filePath, output, 'utf-8');
}

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

  let output = generate(ast, {}, code).code;

  try {
    const prettierConfig = await prettier.resolveConfig(filePath);
    output = await prettier.format(output, {
      ...prettierConfig,
      filepath: filePath,
    });
  } catch (error) {}

  fs.writeFileSync(filePath, output, 'utf-8');
}

async function formatFileWithPrettier(filePath) {
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    const prettierConfig = await prettier.resolveConfig(filePath);

    const formatted = await prettier.format(fileContent, {
      ...prettierConfig,
      filepath: filePath,
    });

    await fs.promises.writeFile(filePath, formatted, 'utf-8');
  } catch (error) {}
}

async function displayConfigTable(selectedSpecFile, selectedVariant) {
  console.clear();

  let foundStateForDisplay = null;
  try {
    process.env.SCREENSHOT_TEST_BUILDER_CLI = 'true';
    await import(path.resolve(selectedSpecFile));
    for (const instance of Builder.__instances) {
      const s = instance.getVariantState(selectedVariant);
      if (s) {
        foundStateForDisplay = s;
        break;
      }
    }
  } catch (err) {}

  const setPageInteractionCode = getSetPageInteractionCode(
    selectedSpecFile,
    selectedVariant
  );

  console.log(chalk.green('Current config for this variant:\n'));

  const interactionData = foundStateForDisplay
    ? {
        ...foundStateForDisplay,
        pageInteraction: setPageInteractionCode || 'Not defined',
      }
    : { pageInteraction: setPageInteractionCode || 'Not defined' };

  const table = new Table({
    head: ['Property', 'Value'],
    colWidths: [25, 60],
    wordWrap: true,
  });

  for (const [key, value] of Object.entries(interactionData)) {
    let formattedValue;
    if (Array.isArray(value)) {
      formattedValue = value.join(', ');
    } else if (typeof value === 'object' && value !== null) {
      formattedValue = JSON.stringify(value, null, 2);
    } else {
      formattedValue = String(value);
    }

    table.push([chalk.cyan(key), formattedValue]);
  }

  console.log(table.toString());
}

async function runTestManager() {
  console.log(chalk.green('Welcome to testManager CLI!\n'));

  while (true) {
    const testsDir = path.join(__dirname, 'tests');
    if (!fs.existsSync(testsDir)) {
      console.log(
        chalk.red(`Tests directory does not exist at path: ${testsDir}`)
      );
      break;
    }

    const specFiles = getSpecFiles(testsDir);
    if (specFiles.length === 0) {
      console.log(chalk.red('No .spec.js files found.'));
      break;
    }

    const relativeSpecFiles = specFiles.map((file) =>
      path.relative(process.cwd(), file)
    );

    const { selectedSpecFile } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedSpecFile',
        message: 'Select a test file:',
        choices: [...relativeSpecFiles, new inquirer.Separator(), 'Exit'],
      },
    ]);

    if (selectedSpecFile === 'Exit') {
      console.log(chalk.blue('Exiting Test Manager.'));
      break;
    }

    const testVariants = getTestVariants(selectedSpecFile);
    if (testVariants.length === 0) {
      console.log(chalk.yellow('No test variants found.'));
      continue;
    }

    const { selectedVariant } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedVariant',
        message: 'Select a test variant:',
        choices: [
          ...testVariants,
          new inquirer.Separator(),
          'Back to file selection',
        ],
      },
    ]);

    if (selectedVariant === 'Back to file selection') {
      console.clear();
      continue;
    }

    console.log(chalk.blue(`\nYou selected file: ${selectedSpecFile}`));
    console.log(chalk.blue(`You selected variant: ${selectedVariant}`));

    await displayConfigTable(selectedSpecFile, selectedVariant);

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
          { name: 'Back to variant selection', value: 'back' },
          { name: 'Exit', value: 'exit' },
        ],
        default: 'back',
      },
    ]);

    if (actionChoice === 'override') {
      process.env.SCREENSHOT_TEST_BUILDER_CLI = 'true';
      try {
        await import(path.resolve(selectedSpecFile));
      } catch (err) {}

      let foundState = null;
      for (const instance of Builder.__instances) {
        const s = instance.getVariantState(selectedVariant);
        if (s) {
          foundState = s;
          break;
        }
      }

      const pageUrl = config.basePageUrl + foundState?.pageRoute;

      let newInteractionCode;
      try {
        newInteractionCode = await codegenAndExtract(pageUrl);
        console.log(
          chalk.green('\nPlaywright codegen completed. Extracted code:')
        );
        console.log(chalk.white(newInteractionCode));
      } catch (err) {}

      if (!newInteractionCode) {
        continue;
      }

      await overrideSetPageInteraction(
        selectedSpecFile,
        selectedVariant,
        newInteractionCode
      );

      await formatFileWithPrettier(selectedSpecFile);

      await displayConfigTable(selectedSpecFile, selectedVariant);
    } else if (actionChoice === 'remove') {
      await removeSetPageInteraction(selectedSpecFile, selectedVariant);

      await formatFileWithPrettier(selectedSpecFile);

      await displayConfigTable(selectedSpecFile, selectedVariant);
    } else if (actionChoice === 'back') {
      console.clear();
      continue;
    } else if (actionChoice === 'exit') {
      console.log(chalk.blue('Exiting Test Manager.'));
      break;
    }

    const { continueChoice } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueChoice',
        message: 'Would you like to perform another operation?',
        default: true,
      },
    ]);

    if (!continueChoice) {
      console.log(chalk.blue('Exiting Test Manager.'));
      break;
    }
  }

  console.log(chalk.green('\nTest Manager operation completed.'));
}

runTestManager();