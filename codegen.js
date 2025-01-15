#!/usr/bin/env node
// playwright-module.js
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as babelParser from '@babel/parser';
import traverseModule from '@babel/traverse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const traverse = traverseModule.default;

// Utility function to execute shell commands and return a promise
const executeCommand = (command) => {
  return new Promise((resolve, reject) => {
    const process = exec(command, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr });
        return;
      }
      resolve(stdout);
    });

    // Forward stdout and stderr to the parent process
    process.stdout.pipe(process.stdout);
    process.stderr.pipe(process.stderr);
  });
};

// Function to parse the input.js file and extract function bodies
const parseInputFile = async (inputFile, outputFile) => {
  const inputFilePath = path.resolve(__dirname, inputFile);
  const outputFilePath = path.resolve(__dirname, outputFile);

  try {
    const code = await fs.promises.readFile(inputFilePath, 'utf8');

    const ast = babelParser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });

    let extractedCode = '';

    traverse(ast, {
      FunctionDeclaration(path) {
        const body = path.node.body;
        const functionCode = extractBodyCode(body, code);
        extractedCode += functionCode + '\n';
      },
      FunctionExpression(path) {
        const body = path.node.body;
        const functionCode = extractBodyCode(body, code);
        extractedCode += functionCode + '\n';
      },
      ArrowFunctionExpression(path) {
        const body = path.node.body;
        if (body.type === 'BlockStatement') {
          const functionCode = extractBodyCode(body, code);
          extractedCode += functionCode + '\n';
        }
      },
    });

    await fs.promises.writeFile(outputFilePath, extractedCode, 'utf8');
    console.log(`Extracted code has been written to ${outputFilePath}`);
  } catch (err) {
    console.error('Error during parsing:', err);
    throw err;
  }
};

// Helper function to extract the body code from AST nodes
const extractBodyCode = (body, fullCode) => {
  const { start, end } = body;
  const bodyCode = fullCode.slice(start + 1, end - 1).trim();

  const lines = bodyCode.split('\n');

  if (lines.length > 0) {
    lines.shift(); // Remove the first line if needed
  }

  return lines.join('\n');
};

// Main function to orchestrate the steps
const main = async () => {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node playwright-module.js <pageUrl> [outputFile]');
    process.exit(1);
  }

  const [pageUrl, outputFile = 'output.js'] = args;
  const inputFile = 'input.js';

  try {
    console.log(`Running playwright codegen for URL: ${pageUrl}`);
    await executeCommand(`npx playwright codegen ${pageUrl} --output=${inputFile}`);
    console.log('Playwright codegen completed.');

    await parseInputFile(inputFile, outputFile);

    // Remove the input.js file
    const inputFilePath = path.resolve(__dirname, inputFile);
    await fs.promises.unlink(inputFilePath);
    console.log(`Removed temporary file: ${inputFilePath}`);
  } catch (err) {
    console.error('An error occurred:', err);
    process.exit(1);
  }
};

// Execute the main function
main();
