import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as babelParser from '@babel/parser';
import traverseModule from '@babel/traverse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const traverse = traverseModule.default;

const [,, inputFile = 'input.js', outputFile = 'output.js'] = process.argv;

const inputFilePath = path.resolve(__dirname, inputFile);
const outputFilePath = path.resolve(__dirname, outputFile);

fs.readFile(inputFilePath, 'utf8', (err, code) => {
  if (err) {
    console.error('Error reading the input file:', err);
    return;
  }

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

  fs.writeFile(outputFilePath, extractedCode, 'utf8', (err) => {
    if (err) {
      console.error('Error writing to the output file:', err);
      return;
    }
    console.log(`Extracted code has been written to ${outputFilePath}`);
  });
});

function extractBodyCode(body, fullCode) {
  const { start, end } = body;
  const bodyCode = fullCode.slice(start + 1, end - 1).trim();

  const lines = bodyCode.split('\n');

  lines.shift();

  return lines.join('\n');
}
