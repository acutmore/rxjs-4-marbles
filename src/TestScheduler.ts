/// <reference path="../node_modules/rx/ts/rx.all.d.ts" />

import { getColdObservableClass } from './ColdObservable'
import { Notification } from './Notification';
import { SubscriptionLog } from './SubscriptionLog';
import { TestMessage } from './TestMessage';
import { testMessageToRecord } from './conversion';

type ColdObservable = any;
type HotObservable = any;

export type observableToBeFn = (marbles: string, values?: any, errorValue?: any) => void;
export type subscriptionLogsToBeFn = (marbles: string | string[]) => void

export function createTestScheduler(rx: typeof Rx, testScheduler: Rx.TestScheduler) {
    return class TestScheduler {

        private static frameTimeFactor: number = 10

        constructor(
            public assertDeepEqual: (actual: any, expected: any) => boolean | void
        ) {
        }

        createTime(marbles: string): number {
            const indexOf: number = marbles.indexOf('|');
            if (indexOf === -1) {
                throw new Error('marble diagram for time should have a completion marker "|"');
            }
            return indexOf * TestScheduler.frameTimeFactor;
        }

        flush() {
            testScheduler.start();
        }

        createColdObservable(
            marbles: string,
            values?: any,
            error?: any
        ): ColdObservable {
            if (marbles.indexOf('^') !== -1) {
                throw new Error('cold observable cannot have subscription offset "^"');
            }
            if (marbles.indexOf('!') !== -1) {
                throw new Error('cold observable cannot have unsubscription marker "!"');
            }
            const messages = TestScheduler.parseMarbles(marbles, values, error);
            const records = messages.map(testMessageToRecord(rx));
            const cold = testScheduler.createColdObservable(...records);
            return cold;
        }

        createHotObservable(
            marbles: string,
            values?: any,
            error?: any
        ): HotObservable {
        }

        static parseMarbles(
            marbles: string,
            values?: any,
            errorValue?: any,
            materializeInnerObservables: boolean = false
        ): TestMessage[] {
            if (marbles.indexOf('!') !== -1) {
                throw new Error('conventional marble diagrams cannot have the ' +
                    'unsubscription marker "!"');
            }
            const len = marbles.length;
            const testMessages: TestMessage[] = [];
            const subIndex = marbles.indexOf('^');
            const frameOffset = subIndex === -1 ? 0 : (subIndex * -this.frameTimeFactor);
            const getValue = typeof values !== 'object' ?
                (x: any) => x :
                (x: any) => {
                    // Support Observable-of-Observables
                    if (materializeInnerObservables && values[x] instanceof getColdObservableClass(rx)) {
                        return values[x].messages;
                    }
                    return values[x];
                };
            let groupStart = -1;

            for (let i = 0; i < len; i++) {
                const frame = i * this.frameTimeFactor + frameOffset;
                let notification: Notification<any>;
                const c = marbles[i];
                switch (c) {
                    case '-':
                    case ' ':
                        break;
                    case '(':
                        groupStart = frame;
                        break;
                    case ')':
                        groupStart = -1;
                        break;
                    case '|':
                        notification = Notification.createComplete();
                        break;
                    case '^':
                        break;
                    case '#':
                        notification = Notification.createError(errorValue || 'error');
                        break;
                    default:
                        notification = Notification.createNext(getValue(c));
                        break;
                }

                if (notification) {
                    testMessages.push({ frame: groupStart > -1 ? groupStart : frame, notification });
                }
            }
            return testMessages;
        }

        static parseMarblesAsSubscriptions(
            marbles: string
        ): SubscriptionLog {
            if (typeof marbles !== 'string') {
                return new SubscriptionLog(Number.POSITIVE_INFINITY);
            }
            const len = marbles.length;
            let groupStart = -1;
            let subscriptionFrame = Number.POSITIVE_INFINITY;
            let unsubscriptionFrame = Number.POSITIVE_INFINITY;

            for (let i = 0; i < len; i++) {
                const frame = i * this.frameTimeFactor;
                const c = marbles[i];
                switch (c) {
                    case '-':
                    case ' ':
                        break;
                    case '(':
                        groupStart = frame;
                        break;
                    case ')':
                        groupStart = -1;
                        break;
                    case '^':
                        if (subscriptionFrame !== Number.POSITIVE_INFINITY) {
                            throw new Error('found a second subscription point \'^\' in a ' +
                                'subscription marble diagram. There can only be one.');
                        }
                        subscriptionFrame = groupStart > -1 ? groupStart : frame;
                        break;
                    case '!':
                        if (unsubscriptionFrame !== Number.POSITIVE_INFINITY) {
                            throw new Error('found a second subscription point \'^\' in a ' +
                                'subscription marble diagram. There can only be one.');
                        }
                        unsubscriptionFrame = groupStart > -1 ? groupStart : frame;
                        break;
                    default:
                        throw new Error('there can only be \'^\' and \'!\' markers in a ' +
                            'subscription marble diagram. Found instead \'' + c + '\'.');
                }
            }

            if (unsubscriptionFrame < 0) {
                return new SubscriptionLog(subscriptionFrame);
            } else {
                return new SubscriptionLog(subscriptionFrame, unsubscriptionFrame);
            }
        }
    }
}
