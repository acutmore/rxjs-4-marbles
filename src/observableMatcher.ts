import isEqual = require('lodash.isequal');

function stringify(x): string {
    return JSON.stringify(x, function (key, value) {
        if (Array.isArray(value)) {
            return '[' + value
                .map(function (i) {
                    return '\n\t' + stringify(i);
                }) + '\n]';
        }
        return value;
    })
    .replace(/\\"/g, '"')
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, '\n')
    .split('\n')
    .map(line => '\t' + line)
    .join('\n');
}

function deleteErrorNotificationStack(marble) {
    const { notification } = marble;
    if (notification) {
        const { kind, error } = notification;
        if (kind === 'E' && error instanceof Error) {
            notification.error = { name: error.name, message: error.message };
        }
    }
    return marble;
}

export function injectObservableMatcher(chai: any) {
    return function observableMatcher(actual, expected) {
        if (Array.isArray(actual) && Array.isArray(expected)) {
            actual = actual.map(deleteErrorNotificationStack);
            expected = expected.map(deleteErrorNotificationStack);
            const passed = isEqual(actual, expected);
            if (passed) {
                return;
            }

            let message = '\nExpected \n';
            actual.forEach((x) => message += `${stringify(x)}\n`);

            message += '\t\nto deep equal \n';
            expected.forEach((x) => message += `${stringify(x)}\n`);

            chai.assert(passed, message);
        } else {
            chai.assert.deepEqual(actual, expected);
        }
    }
}
