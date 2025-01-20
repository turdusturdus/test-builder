#!/usr/bin/env node

import { fileURLToPath } from 'url';
import assert from 'assert';
// eslint-disable-next-line import/no-unresolved
import { describe, it } from 'node:test';
import {
  quicktype,
  InputData,
  jsonInputForTargetLanguage,
} from 'quicktype-core';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import config from './config.js';

const mockFiles = await loadMockFiles();

const ajv = await setupAjvValidator();

const baseURL = config.baseApiUrl;

describe('mock api against production api', function () {
  for (const mockFile of mockFiles) {
    if (!mockFile?.module?.mockApiPresets) {
      continue;
    }

    it(`should ${mockFile.name} have same schema as real api`, async function () {
      const mockApi = mockFile.module;

      for (const widget of mockApi.mockApiPresets.default) {
        if (widget.endpoint === 'search') continue;
        if (widget.contentType === 'text/html') continue;
        if (widget.apiUrl) continue;

        const url = `${baseURL}${widget.endpoint}${widget.query}`;

        const { addLog, getLogs } = createLogCollector();

        addLog(`=== Testing Widget: ${widget.endpoint}${widget.query} ===`);
        addLog(`Fetching URL: ${url}`);

        let response;
        try {
          response = await fetchFromApi(url);
        } catch (fetchError) {
          addLog(`Error fetching URL ${url}:`, fetchError);
          console.error(getLogs());
          assert.fail(`Failed to fetch URL ${url}: ${fetchError.message}`);
        }

        const contentType = response.headers.get('content-type') || '';

        if (contentType.startsWith('image/')) {
          let responseBuffer;
          try {
            responseBuffer = await response.buffer();
            addLog(
              `Fetched image buffer for ${url}, size: ${responseBuffer.length} bytes`
            );
          } catch (bufferError) {
            addLog(`Error fetching image buffer from ${url}:`, bufferError);
            console.error(getLogs());
            assert.fail(
              `Failed to fetch image buffer from ${url}: ${bufferError.message}`
            );
          }

          const mockImageBuffer = widget.data;
          const isBufferEqual = responseBuffer.equals(mockImageBuffer);

          if (!isBufferEqual) {
            addLog(`Image data mismatch for ${url}`);
            console.error(getLogs());
            assert.fail(
              `Image data does not match for ${widget.endpoint}${widget.query}`
            );
          } else {
            addLog(`Image data matches for ${url}`);
          }
        } else if (contentType.startsWith('application/json')) {
          let body;
          try {
            body = await response.json();
            addLog(`Response Body for ${url}:`, JSON.stringify(body, null, 2));
          } catch (jsonError) {
            addLog(`Error parsing JSON from ${url}:`, jsonError);
            console.error(getLogs());
            assert.fail(
              `Invalid JSON response from ${url}: ${jsonError.message}`
            );
          }

          let schemaStr;
          try {
            schemaStr = await inferSchemaFromJSON(body);
          } catch (schemaError) {
            addLog(
              `Error inferring schema from response of ${url}:`,
              schemaError
            );
            console.error(getLogs());
            assert.fail(
              `Failed to infer schema for ${url}: ${schemaError.message}`
            );
          }

          let schema;
          try {
            schema = adjustSchemaProperties(JSON.parse(schemaStr));
            addLog(
              'Final Schema after all modifications:\n' +
                JSON.stringify(schema, null, 2)
            );
          } catch (modifyError) {
            addLog('Error modifying schema for ' + url + ':', modifyError);
            console.error(getLogs());
            assert.fail(
              'Failed to modify schema for ' + url + ': ' + modifyError.message
            );
          }

          let validate;
          try {
            validate = ajv.compile(schema);
          } catch (compileError) {
            addLog(`Error compiling schema for ${url}:`, compileError);
            console.error(getLogs());
            assert.fail(
              `Schema compilation failed for ${url}: ${compileError.message}`
            );
          }

          const isValid = validate(widget.data);
          if (!isValid) {
            addLog(`\n--- Schema Validation Failed for ${url} ---`);

            collectValidationErrors(validate, widget, addLog);

            console.error(getLogs());
            assert.fail(
              `Schema validation failed for ${widget.endpoint}${widget.query}`
            );
          }
        } else {
          addLog(`Unsupported Content-Type for ${url}: ${contentType}`);
          console.warn(`Unsupported Content-Type for ${url}: ${contentType}`);
        }
      }
    });
  }
});

function adjustSchemaProperties(schema) {
  schema = replaceSpecificKeyValue(schema, 'type', 'integer', 'number');
  schema = replaceSpecificKeyValue(
    schema,
    'format',
    'date-time',
    'iso-date-time'
  );
  schema = replaceSpecificKeyValue(schema, 'format', 'uri', 'uri-or-path');
  schema = deleteKeysByName(schema, 'enum');
  schema = deleteKeysByName(schema, /^qt-/);
  schema = allowAnyForNullTypes(schema);
  schema = allowNullForAllTypes(schema);
  return schema;
}

async function loadMockFiles() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const mockApiDir = path.join(__dirname, 'mock-api');

  const filePaths = await getAllMockFiles(mockApiDir);

  const mockFiles = await Promise.all(
    filePaths.map(async (file) => {
      const module = await import(file);
      const fileName = path.basename(file);
      return { name: fileName, module: module.default || module };
    })
  );
  return mockFiles;
}

async function getAllMockFiles(dir) {
  let results = [];
  const list = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const dirent of list) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      const subDirFiles = await getAllMockFiles(fullPath);
      results = results.concat(subDirFiles);
    } else if (dirent.isFile() && dirent.name.endsWith('.mock.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

async function setupAjvValidator() {
  const json = await fs.promises.readFile(
    new URL('json-schema-draft-06.json', import.meta.url),
    'utf8'
  );
  const draft6MetaSchema = JSON.parse(json);
  const ajv = new Ajv({
    allErrors: true,
    verbose: true,
    allowUnionTypes: true,
  });
  ajv.addMetaSchema(draft6MetaSchema);
  addFormats(ajv);

  ajv.addFormat('uri-or-path', {
    type: 'string',
    validate: (str) => {
      try {
        new URL(str);
        return true;
      } catch (_) {
        return /^\/?[\w\-./]+$/.test(str);
      }
    },
  });

  ajv.addFormat('integer', {
    type: 'string',
    validate: (str) => {
      if (typeof str !== 'string') return false;
      return /^-?\d+$/.test(str) && !isNaN(parseInt(str, 10));
    },
  });

  ajv.addFormat('time', {
    type: 'string',
    validate: (str) => {
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
      return timeRegex.test(str);
    },
  });
  return ajv;
}

async function fetchFromApi(url) {
  return await fetch(url, {
    headers: {
      accept: 'application/json;tenant=notoria',
    },
    referrer: 'https://widgets.notoria.pl',
    method: 'GET',
  });
}

function collectValidationErrors(validate, widget, addLog) {
  validate.errors.forEach((error, index) => {
    const instancePath = error.instancePath;
    const schemaPath = error.schemaPath;
    const message = error.message;

    const pathParts = instancePath.split('/').filter((part) => part !== '');

    let field = 'N/A';
    let itemIndex = 'N/A';

    if (pathParts.length >= 3 && pathParts[0] === 'data') {
      itemIndex = pathParts[1];
      field = pathParts.slice(2).join('.');
    } else if (pathParts.length === 1) {
      field = pathParts[0];
    }

    let invalidValue = 'N/A';
    if (itemIndex !== 'N/A' && widget.data[itemIndex]) {
      invalidValue = widget.data[itemIndex][field];
    } else if (widget.data[field]) {
      invalidValue = widget.data[field];
    }

    let entireObject = 'N/A';
    if (itemIndex !== 'N/A' && widget.data[itemIndex]) {
      entireObject = widget.data[itemIndex];
    }

    addLog(`Error ${index + 1}:`);
    addLog(`  Field: ${field}`);
    addLog(`  Item Index: ${itemIndex}`);
    addLog(`  Invalid Value: ${JSON.stringify(invalidValue, null, 2)}`);
    addLog(`  Entire Object: ${JSON.stringify(entireObject, null, 2)}`);
    addLog(`  Message: ${message}`);
    addLog(`  Schema Path: ${schemaPath}`);
    addLog('----------------------------------------');
  });
}

function createLogCollector() {
  const logMessages = [];

  return {
    addLog: (...args) => {
      logMessages.push(args.join(' '));
    },
    getLogs: () => logMessages.join('\n'),
  };
}

function allowAnyForNullTypes(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => allowAnyForNullTypes(item));
  }

  if (obj.type === 'null') {
    obj.type = [
      'string',
      'number',
      'integer',
      'boolean',
      'object',
      'array',
      'null',
    ];
  }

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      obj[key] = allowAnyForNullTypes(obj[key]);
    }
  }

  return obj;
}

function allowNullForAllTypes(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => allowNullForAllTypes(item));
  }

  if (Object.prototype.hasOwnProperty.call(obj, 'type')) {
    if (typeof obj.type === 'string') {
      if (obj.type !== 'null') {
        obj.type = [obj.type, 'null'];
      } else {
        obj.type = ['null'];
      }
    } else if (Array.isArray(obj.type)) {
      if (!obj.type.includes('null')) {
        obj.type.push('null');
      }
    }
  }

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      obj[key] = allowNullForAllTypes(obj[key]);
    }
  }

  return obj;
}

async function inferSchemaFromJSON(jsonData) {
  const jsonInput = jsonInputForTargetLanguage('schema');
  await jsonInput.addSource({
    name: 'GeneratedSchema',
    samples: [JSON.stringify(jsonData)],
  });

  const inputData = new InputData();
  inputData.addInput(jsonInput);

  const { lines } = await quicktype({
    inputData,
    lang: 'schema',
  });

  return lines.join('\n');
}

function deleteKeysByName(obj, keyToDelete) {
  if (typeof obj !== 'object' || obj === null) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => deleteKeysByName(item, keyToDelete));
  }

  const newObj = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (
        (typeof keyToDelete === 'string' && key === keyToDelete) ||
        (keyToDelete instanceof RegExp && keyToDelete.test(key))
      ) {
        continue;
      }

      if (typeof obj[key] === 'object' && obj[key] !== null) {
        newObj[key] = deleteKeysByName(obj[key], keyToDelete);
      } else {
        newObj[key] = obj[key];
      }
    }
  }

  return newObj;
}

function replaceSpecificKeyValue(obj, targetKey, targetValue, newValue) {
  const newObj = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (key === targetKey && obj[key] === targetValue) {
      newObj[key] = newValue;
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      newObj[key] = replaceSpecificKeyValue(
        obj[key],
        targetKey,
        targetValue,
        newValue
      );
    } else {
      newObj[key] = obj[key];
    }
  }

  return newObj;
}
