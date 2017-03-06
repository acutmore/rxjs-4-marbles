/// <reference path="../node_modules/rx/ts/rx.all.d.ts" />

import { Notification } from './Notification';
import { SubscriptionLog } from './SubscriptionLog';
import { TestMessage } from './TestMessage';

interface FlushableTest {
    ready: boolean;
    actual?: any[];
    expected?: any[];
}

export interface ITestScheduler {
    createTime(marbles: string): number;
    flush(): void;
    createColdObservable(marbles: string, values?: any, error?: any): Rx.Observable<any>;
    createHotObservable(marbles: string, values?: any, error?: any): Rx.Observable<any>;
    expectObservable(observable: Rx.Observable<any>, unsubscriptionMarbles?: string): ({ toBe: observableToBeFn });
}

export interface TestSchedulerStatic {
    new(assertDeepEqual: (actual: any, expected: any) => boolean | void): ITestScheduler;
    parseMarbles(marbles: string, values?: any, errorValue?: any, materializeInnerObservables?: boolean): TestMessage[];
    parseMarblesAsSubscriptions(marbles: string): SubscriptionLog;
}

export type observableToBeFn = (marbles: string, values?: any, errorValue?: any) => void;
export type subscriptionLogsToBeFn = (marbles: string | string[]) => void

export function createTestScheduler(rx: typeof Rx, testScheduler: Rx.TestScheduler): TestSchedulerStatic {
    return class TestScheduler implements ITestScheduler {

        private static frameTimeFactor: number = 10

        private flushTests: FlushableTest[] = []

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

        flush(): void {
            // const hotObservables = this.hotObservables;
            // while (hotObservables.length > 0) {
            //     hotObservables.shift().setup();
            // }

            testScheduler.start(); //previously super.flush()

            const readyFlushTests = this.flushTests.filter(test => test.ready);
            while (readyFlushTests.length > 0) {
                const test = readyFlushTests.shift();
                this.assertDeepEqual(test.actual, test.expected);
            }
        }

        createColdObservable(
            marbles: string,
            values?: any,
            error?: any
        ): Rx.Observable<any> {
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
        ): Rx.Observable<any> {
            if (marbles.indexOf('!') !== -1) {
                throw new Error('hot observable cannot have unsubscription marker "!"');
            }
            const messages = TestScheduler.parseMarbles(marbles, values, error);
            const records = messages.map(testMessageToRecord(rx));
            const hot = testScheduler.createHotObservable(...records);
            const subject = new rx.Subject();
            hot.subscribe(subject);
            return subject;
        }

        expectObservable(
            observable: Rx.Observable<any>,
            unsubscriptionMarbles: string = null
        ): ({ toBe: observableToBeFn }) {
            const actual: TestMessage[] = [];
            const flushTest: FlushableTest = { actual, ready: false, expected: undefined };
            const unsubscriptionFrame = TestScheduler
                .parseMarblesAsSubscriptions(unsubscriptionMarbles).unsubscribedFrame;
            let subscription: Rx.IDisposable;

            testScheduler.schedule({}, (scheduler, state) => {
                subscription = observable.subscribe(x => {
                    let value = x;
                    // Support Observable-of-Observables
                    if (x instanceof (rx.Observable as any)) {
                        value = this.materializeInnerObservable(value, testScheduler.now());
                    }
                    actual.push({ frame: testScheduler.now(), notification: Notification.createNext(value) });
                }, (err) => {
                    actual.push({ frame: testScheduler.now(), notification: Notification.createError(err) });
                }, () => {
                    actual.push({ frame: testScheduler.now(), notification: Notification.createComplete() });
                });
                return subscription;
            });

            if (unsubscriptionFrame !== Number.POSITIVE_INFINITY) {
                testScheduler.scheduleFuture(
                    {},
                    unsubscriptionFrame,
                    () => (subscription.dispose(),rx.Disposable.empty)
                );
            }

            this.flushTests.push(flushTest);

            return {
                toBe(marbles: string, values?: any, errorValue?: any) {
                    flushTest.ready = true;
                    flushTest.expected = TestScheduler.parseMarbles(marbles, values, errorValue, true);
                }
            };
        }

        expectSubscriptions(
            actualSubscriptionLogs: SubscriptionLog[]
        ): ({ toBe: subscriptionLogsToBeFn }) {
            const flushTest: FlushableTest = { actual: actualSubscriptionLogs, ready: false, expected: undefined };
            this.flushTests.push(flushTest);
            return {
                toBe(marbles: string | string[]) {
                    const marblesArray: string[] = (typeof marbles === 'string') ? [marbles] : marbles;
                    flushTest.ready = true;
                    flushTest.expected = marblesArray.map(marbles =>
                        TestScheduler.parseMarblesAsSubscriptions(marbles)
                    );
                }
            };
        }

        private materializeInnerObservable(
            observable: Rx.Observable<any>,
            outerFrame: number
        ): TestMessage[] {
            const messages: TestMessage[] = [];
            observable.subscribe((value) => {
                messages.push({ frame: testScheduler.now() - outerFrame, notification: Notification.createNext(value) });
            }, (err) => {
                messages.push({ frame: testScheduler.now() - outerFrame, notification: Notification.createError(err) });
            }, () => {
                messages.push({ frame: testScheduler.now() - outerFrame, notification: Notification.createComplete() });
            });
            return messages;
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

function getColdObservableClass(rx: typeof Rx) {
    const ts = new rx.TestScheduler();
    const co = ts.createColdObservable();
    return co.constructor;
}

function testMessageToRecord(rx: typeof Rx) {
    return function (msg: TestMessage): Rx.Recorded {
        return msg.notification.do(
            (value) => rx.ReactiveTest.onNext(msg.frame, value),
            (error) => rx.ReactiveTest.onError(msg.frame, error),
            () => rx.ReactiveTest.onCompleted(msg.frame)
        );
    };
}
