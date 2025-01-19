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

const mockFiles = await loadMockFiles();

const ajv = await setupAjvValidator();

/**
* Base URL for fetching real API data — now pointing to https://automationintesting.online
*/
const baseURL = 'https://automationintesting.online/';

// Main test suite
describe('mock api against production api', function () {
 // Iterate over all mock files
 for (const mockFile of mockFiles) {
   // Skip if no e2e presets
   if (!mockFile?.module?.mockApiPresets) {
     continue;
   }

   // Example: Uncomment the next line to focus on a specific mock file
   // if (mockFile.name !== 'some-specific.mock.js') continue;

   it(`should ${mockFile.name} have same schema as real api`, async function () {
     const mockApi = mockFile.module;

     // Go through each widget preset in the mock file
     for (const widget of mockApi.mockApiPresets.default) {
       if (widget.endpoint === 'search') continue;
       if (widget.contentType === 'text/html') continue;
       if (widget.apiUrl) continue;

       const url = `${baseURL}${widget.endpoint}${widget.query}`;

       // Simple logger to collect messages
       const { addLog, getLogs } = createLogCollector();

       addLog(`=== Testing Widget: ${widget.endpoint}${widget.query} ===`);
       addLog(`Fetching URL: ${url}`);

       // Fetch the actual data from the real API
       let response;
       try {
         response = await fetchFromApi(url);
       } catch (fetchError) {
         addLog(`Error fetching URL ${url}:`, fetchError);
         console.error(getLogs());
         assert.fail(`Failed to fetch URL ${url}: ${fetchError.message}`);
       }

       // Check the Content-Type header
       const contentType = response.headers.get('content-type') || '';

       if (contentType.startsWith('image/')) {
         // Handle image content types
         let responseBuffer;
         try {
           responseBuffer = await response.buffer();
           addLog(`Fetched image buffer for ${url}, size: ${responseBuffer.length} bytes`);
         } catch (bufferError) {
           addLog(`Error fetching image buffer from ${url}:`, bufferError);
           console.error(getLogs());
           assert.fail(`Failed to fetch image buffer from ${url}: ${bufferError.message}`);
         }

         // Compare the fetched image buffer with the mock data
         const mockImageBuffer = widget.data;
         const isBufferEqual = responseBuffer.equals(mockImageBuffer);

         if (!isBufferEqual) {
           addLog(`Image data mismatch for ${url}`);
           console.error(getLogs());
           assert.fail(`Image data does not match for ${widget.endpoint}${widget.query}`);
         } else {
           addLog(`Image data matches for ${url}`);
         }

       } else if (contentType.startsWith('application/json')) {
         // Handle JSON content types
         let body;
         try {
           body = await response.json();
           addLog(`Response Body for ${url}:`, JSON.stringify(body, null, 2));
         } catch (jsonError) {
           addLog(`Error parsing JSON from ${url}:`, jsonError);
           console.error(getLogs());
           assert.fail(`Invalid JSON response from ${url}: ${jsonError.message}`);
         }

         // Infer schema from JSON
         let schemaStr;
         try {
           schemaStr = await inferSchemaFromJSON(body);
           // addLog(`Inferred Schema for ${url}:\n${schemaStr}`);
         } catch (schemaError) {
           addLog(`Error inferring schema from response of ${url}:`, schemaError);
           console.error(getLogs());
           assert.fail(`Failed to infer schema for ${url}: ${schemaError.message}`);
         }

         // Modify the inferred schema to match custom requirements
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
           assert.fail('Failed to modify schema for ' + url + ': ' + modifyError.message);
         }

         // Compile the modified schema
         let validate;
         try {
           validate = ajv.compile(schema);
         } catch (compileError) {
           addLog(`Error compiling schema for ${url}:`, compileError);
           console.error(getLogs());
           assert.fail(`Schema compilation failed for ${url}: ${compileError.message}`);
         }

         // Validate the mock data against the compiled schema
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
         // Handle other content types if necessary
         addLog(`Unsupported Content-Type for ${url}: ${contentType}`);
         console.warn(`Unsupported Content-Type for ${url}: ${contentType}`);
       }
     }
   });
 }
});

function adjustSchemaProperties(schema) {
 schema = replaceSpecificKeyValue(schema, 'type', 'integer', 'number');
 schema = replaceSpecificKeyValue(schema, 'format', 'date-time', 'iso-date-time');
  // *** Start of Modification ***
 // Replace 'uri' format with 'uri-or-path' to accept both URIs and file paths
 schema = replaceSpecificKeyValue(schema, 'format', 'uri', 'uri-or-path');
 // *** End of Modification ***
  schema = deleteKeysByName(schema, 'enum');
 schema = deleteKeysByName(schema, /^qt-/);
 schema = allowAnyForNullTypes(schema);
 schema = allowNullForAllTypes(schema);
 return schema;
}

async function loadMockFiles() {
 // Get __dirname and __filename in ESM
 const __filename = fileURLToPath(import.meta.url);
 const __dirname = path.dirname(__filename);

 const mockApiDir = path.join(__dirname, 'mock-api');

 // Recursively collect all .mock.js files within the mock-api directory
 const filePaths = await getAllMockFiles(mockApiDir);

 // Asynchronously import all mock files using top-level await
 const mockFiles = await Promise.all(
   filePaths.map(async (file) => {
     const module = await import(file);
     const fileName = path.basename(file);
     return { name: fileName, module: module.default || module };
   })
 );
 return mockFiles;
}

/**
* Recursively retrieves all .mock.js file paths within a given directory.
* @param {string} dir - The directory to search within.
* @returns {Promise<string[]>} - An array of file paths.
*/
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
 // Load the JSON schema (draft-06)
 const json = await fs.promises.readFile(
   new URL('json-schema-draft-06.json', import.meta.url),
   'utf8'
 );
 const draft6MetaSchema = JSON.parse(json);
 // Initialize AJV
 const ajv = new Ajv({
   allErrors: true,
   verbose: true,
   allowUnionTypes: true,
 });
 ajv.addMetaSchema(draft6MetaSchema);
 addFormats(ajv);

 // *** Start of Modification ***
 // Add custom format 'uri-or-path' to accept both URIs and file paths
 ajv.addFormat('uri-or-path', {
   type: 'string',
   validate: (str) => {
     // Check if the string is a valid URI
     try {
       new URL(str);
       return true;
     } catch (_) {
       // Not a valid URI, check if it's a relative file path
       // This regex allows paths like '/images/room2.jpg', 'images/room2.jpg', etc.
       return /^\/?[\w\-./]+$/.test(str);
     }
   },
 });
 // *** End of Modification ***

 // Add custom formats
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
   const instancePath = error.instancePath; // e.g., "/data/0/date"
   const schemaPath = error.schemaPath;     // e.g., "#/properties/date/format"
   const message = error.message;           // e.g., "must match format \"date\""

   // Split the instancePath to extract indices and field names
   const pathParts = instancePath.split('/').filter((part) => part !== '');

   let field = 'N/A';
   let itemIndex = 'N/A';

   if (pathParts.length >= 3 && pathParts[0] === 'data') {
     itemIndex = pathParts[1];
     field = pathParts.slice(2).join('.'); // Handles nested fields if any
   } else if (pathParts.length === 1) {
     field = pathParts[0];
   }

   // Retrieve the invalid value from the mock data
   let invalidValue = 'N/A';
   if (itemIndex !== 'N/A' && widget.data[itemIndex]) {
     invalidValue = widget.data[itemIndex][field];
   } else if (widget.data[field]) {
     invalidValue = widget.data[field];
   }

   // Optionally, retrieve the entire object that contains the invalid field
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

/**
* Recursively allows any type for schema properties that have type 'null'.
* Specifically modifies fields where type is 'null' to accept all possible types.
*/
function allowAnyForNullTypes(obj) {
 if (typeof obj !== 'object' || obj === null) return obj;

 if (Array.isArray(obj)) {
   return obj.map((item) => allowAnyForNullTypes(item));
 }

 // If the type is 'null', modify it to accept all types
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

/**
* Recursively allows null for all types in the schema.
* Specifically modifies every 'type' property to include 'null' alongside its existing type(s).
*/
function allowNullForAllTypes(obj) {
 if (typeof obj !== 'object' || obj === null) return obj;

 if (Array.isArray(obj)) {
   return obj.map((item) => allowNullForAllTypes(item));
 }

 // If 'type' exists, ensure it's an array and includes 'null'
 if (Object.prototype.hasOwnProperty.call(obj, 'type')) {
   if (typeof obj.type === 'string') {
     if (obj.type !== 'null') {
       obj.type = [obj.type, 'null'];
     } else {
       // If type is already 'null', ensure it's an array
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

/**
* Uses quicktype to infer a JSON Schema from a given JSON object.
*/
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

/**
* Recursively deletes all occurrences of a given key or keys matching a pattern from an object.
* @param {Object|Array} obj - The object or array to process.
* @param {string | RegExp} keyToDelete - The key name to delete or a RegExp pattern.
*/
function deleteKeysByName(obj, keyToDelete) {
 if (typeof obj !== 'object' || obj === null) return obj;

 if (Array.isArray(obj)) {
   return obj.map((item) => deleteKeysByName(item, keyToDelete));
 }

 const newObj = {};

 for (const key in obj) {
   if (Object.prototype.hasOwnProperty.call(obj, key)) {
     // If keyToDelete is a string, delete exact matches
     // If keyToDelete is a RegExp, delete keys matching the pattern
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

/**
* Recursively replaces a specific key/value pair with a new value.
*/
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