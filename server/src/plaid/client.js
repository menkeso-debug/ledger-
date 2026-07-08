import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { config, assertConfigured } from '../config.js';

let _client = null;

export function plaid() {
  if (!_client) {
    assertConfigured('plaid.clientId', 'plaid.secret');
    _client = new PlaidApi(
      new Configuration({
        basePath: PlaidEnvironments[config.plaid.env],
        baseOptions: {
          headers: {
            'PLAID-CLIENT-ID': config.plaid.clientId,
            'PLAID-SECRET': config.plaid.secret,
          },
        },
      })
    );
  }
  return _client;
}
