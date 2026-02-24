import assert from 'assert';
import fs from 'fs';

describe('#validate pre deployment files', function() {
  it('test that config.json.dist file is valid', () => {
    const config = JSON.parse(fs.readFileSync(`${__dirname}/../conf.json.dist`, 'utf8'));

    assert.equal(config.webserver.ip, '0.0.0.0');
  });

  it('test that instance.js.dist file is valid', () => {
    const instances = require(`${__dirname}/../instance.js.dist`);

    assert.equal(instances.symbols.length > 0, true);
    assert.equal(instances.symbols.filter((i: any) => i.symbol === 'ETHUSD').length, 1);
  });
});
