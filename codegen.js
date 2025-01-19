#!/usr/bin/env node
// codegen.js
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

// Helper function to extract the body code from AST nodes
const extractBodyCode = (body, fullCode) => {
  const { start, end } = body;
  const bodyCode = fullCode.slice(start + 1, end - 1).trim();

  const lines = bodyCode.split('\n');
  if (lines.length > 0) {
    lines.shift(); // Optionally remove the first line if needed
  }

  return lines.join('\n');
};

// Function to parse the generated Playwright file and return extracted code
const parseInputFile = async (inputFile) => {
  const code = await fs.promises.readFile(inputFile, 'utf8');
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

  // Return the raw extracted code
  return extractedCode.trim();
};

/**
 * Main reusable function that:
 * 1) Runs `npx playwright codegen <pageUrl>`.
 * 2) Parses the generated file and extracts relevant code.
 * 3) Cleans up the temporary input file.
 *
 * @param {string} pageUrl - The URL to codegen against.
 * @returns {Promise<string>} - The extracted code as a string.
 */
export async function codegenAndExtract(pageUrl) {
  const inputFile = path.join(__dirname, 'input.js');

  try {
    // 1. Run codegen to create input.js
    console.log(`Running playwright codegen for URL: ${pageUrl}`);
    await executeCommand(`npx playwright codegen ${pageUrl} --output=${inputFile}`);
    console.log('Playwright codegen completed.');

    // 2. Parse the generated file and extract code
    const extractedCode = await parseInputFile(inputFile);

    // 3. Remove the temporary input file
    await fs.promises.unlink(inputFile);
    console.log(`Removed temporary file: ${inputFile}`);

    return extractedCode;
  } catch (err) {
    console.error('An error occurred during codegen:', err);
    throw err;
  }
}
