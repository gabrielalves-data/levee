'use strict';

// All secrets live in the OS keychain via keytar.
// They never touch SQLite, log files, or JSON exports.

const SERVICE_NAME = 'levee';

let keytar;
try {
  keytar = require('keytar');
} catch {
  keytar = {
    getPassword:    async () => { throw new Error('keytar native module not built'); },
    setPassword:    async () => { throw new Error('keytar native module not built'); },
    deletePassword: async () => { throw new Error('keytar native module not built'); },
  };
}

async function getSecret(account) {
  return keytar.getPassword(SERVICE_NAME, account);
}

async function setSecret(account, value) {
  return keytar.setPassword(SERVICE_NAME, account, value);
}

async function deleteSecret(account) {
  return keytar.deletePassword(SERVICE_NAME, account);
}

module.exports = { getSecret, setSecret, deleteSecret };
