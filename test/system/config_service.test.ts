import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { ConfigService } from '../../src/modules/system/config_service';

describe('#config service test', function() {
  const testConfigDir = path.join(__dirname, 'fixtures');
  const testConfigFile = path.join(testConfigDir, 'var', 'config.json');

  before(() => {
    // Create test config directory and file
    fs.mkdirSync(path.dirname(testConfigFile), { recursive: true });
    fs.writeFileSync(testConfigFile, JSON.stringify({
      root: 'test123',
      root2: null,
      webserver: {
        test: 8080
      }
    }));
  });

  after(() => {
    // Clean up test config
    if (fs.existsSync(testConfigFile)) {
      fs.unlinkSync(testConfigFile);
    }
  });

  it('test configuration extraction', () => {
    const configService = new ConfigService(testConfigDir);

    assert.equal(configService.getConfig('webserver.test'), 8080);
    assert.equal(configService.getConfig('root'), 'test123');
    assert.equal(configService.getConfig('UNKNOWN', 'test'), 'test');
    assert.equal(configService.getConfig('UNKNOWN'), undefined);
    assert.equal(configService.getConfig('root2', 'test'), 'test');
  });
});
