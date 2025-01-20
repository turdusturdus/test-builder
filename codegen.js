#!/usr/bin/env node
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as babelParser from '@babel/parser';
import traverseModule from '@babel/traverse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const traverse = traverseModule.default;

const executeCommand = (command) => {
  return new Promise((resolve, reject) => {
    const process = exec(command, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr });
        return;
      }
      resolve(stdout);
    });

    process.stdout.pipe(process.stdout);
    process.stderr.pipe(process.stderr);
  });
};

const extractBodyCode = (body, fullCode) => {
  const { start, end } = body;
  const bodyCode = fullCode.slice(start + 1, end - 1).trim();

  const lines = bodyCode.split('\n');
  if (lines.length > 0) {
    lines.shift();
  }

  return lines.join('\n');
};

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

  return extractedCode.trim();
};

export async function codegenAndExtract(pageUrl) {
  const inputFile = path.join(__dirname, 'input.js');

  try {
    console.log(`Running playwright codegen for URL: ${pageUrl}`);
    await executeCommand(
      `npx playwright codegen ${pageUrl} --output=${inputFile}`
    );
    console.log('Playwright codegen completed.');

    const extractedCode = await parseInputFile(inputFile);

    await fs.promises.unlink(inputFile);
    console.log(`Removed temporary file: ${inputFile}`);

    return extractedCode;
  } catch (err) {
    console.error('An error occurred during codegen:', err);
    throw err;
  }
}
