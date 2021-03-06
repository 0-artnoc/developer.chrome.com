const test = require('ava');
const tmp = require('tmp');
const fs = require('fs');

const {
  generateTypeDocObject,
  parseChromeTypesFile,
} = require('../../../tools/types/types');
const {exportedChildren} = require('../../../tools/types/helpers');

const namespacesPromise = buildCommonTestNamespaces();

// We use a common parsed string for a number of tests. This returns a Promise
// so failures here show up in each test case, not globally.
async function buildCommonTestNamespaces() {
  const commonTestSource = `
declare namespace notChrome {
  export var testValue: number;
}

declare namespace chrome {
  export namespace test {
    export var enumTestSingle: "foo";
    export var enumTestMany: "foo" | "bar";
    export interface Stuff {}
  }
  export namespace stuff {
    export interface StuffType {
      manySelfStuff?: chrome.stuff.StuffType[];
      otherNamespaceStuff: chrome.test.Stuff;
    }
    export type TwoStuffType = {0: StuffType, 1: StuffType} & StuffType[];
  }
}
`;

  const f = tmp.fileSync({postfix: '.d.ts'});
  try {
    fs.writeFileSync(f.name, commonTestSource);
    return parseChromeTypesFile(f.name);
  } finally {
    f.removeCallback();
  }
}

// Ensure that we remove all temporary files.
test.afterEach.always(t => {
  t.context.cleanup?.();
});

test('identifies exported namespace children', t => {
  const source = `
declare namespace test {
  var foo: number;

  export {foo as bar};
  export {foo as bar2};

  export var bar3: "enum";

  export interface Exported {}
}
`;
  const f = tmp.fileSync({postfix: '.d.ts'});
  fs.writeFileSync(f.name, source);
  t.context.cleanup = f.removeCallback;

  const td = generateTypeDocObject(f.name);

  const toplevel = td.children[0];
  const testNamespace = toplevel.getChildByName('test');

  const children = exportedChildren(testNamespace, ~0);
  const keys = Object.keys(children);
  keys.sort();

  t.deepEqual(keys, ['Exported', 'bar', 'bar2', 'bar3']);
});

test('parse demo Chrome types', async t => {
  const namespaces = await namespacesPromise;
  t.is(namespaces.length, 2);

  const [chromeStuff, chromeTest] = namespaces;
  t.is(chromeStuff.name, 'chrome.stuff');
  t.is(chromeTest.name, 'chrome.test');

  const enumTestSingle = chromeTest.properties.find(
    ({name}) => name === 'enumTestSingle'
  );
  t.deepEqual(
    enumTestSingle,
    {
      name: 'enumTestSingle',
      type: 'union',
      isEnum: true,
      options: [
        {
          type: 'primitive',
          literalValue: '"foo"',
        },
      ],
    },
    'single string is converted to enum'
  );

  const typeTwoStuff = chromeStuff.types.find(
    ({name}) => name === 'TwoStuffType'
  );
  t.deepEqual(
    typeTwoStuff,
    {
      name: 'TwoStuffType',
      type: 'array',
      minLength: 2,
      elementType: {
        type: 'reference',
        referenceLink: true,
        referenceType: 'chrome.stuff.StuffType',
      },
    },
    'TwoStuffType is a reference to array of minLength=2'
  );
});
