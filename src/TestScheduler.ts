/// <reference path="../node_modules/rx/ts/rx.all.d.ts" />

import rx = require('rx');
import { Notification } from './Notification';
import { SubscriptionLog } from './SubscriptionLog';
import { TestMessage } from './TestMessage';
import { injectObservableMatcher } from './observableMatcher';

type comparator = (actual: any, expected: any) => boolean | void;

interface FlushableTest {
    ready: boolean;
    actual?: any[];
    expected?: any[];
}

declare var require: (path: string) => any;

export type observableToBeFn = (marbles: string, values?: any, errorValue?: any) => void;
export type subscriptionLogsToBeFn = (marbles: string | string[]) => void

export class TestScheduler {

    static default(): TestScheduler {
        const chai = require('chai');
        const comparator = injectObservableMatcher(chai);
        const ts = new TestScheduler(comparator, new rx.TestScheduler());
        return ts;
    }

    private static frameTimeFactor: number = 10

    private flushTests: FlushableTest[] = []

    constructor(
        private assertDeepEqual: comparator,
        public scheduler: Rx.TestScheduler
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

        this.scheduler.start(); //previously super.flush()

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
        const cold = this.scheduler.createColdObservable(...records);
        return logSubscription(rx, this.scheduler, cold);
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
        const hot = this.scheduler.createHotObservable(...records);
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

        (this.scheduler as any).clock -= 1; // RxJS 4 always schedules delay + 1
        this.scheduler.schedule({}, (scheduler, state) => {
            subscription = observable.subscribe(x => {
                let value = x;
                // Support Observable-of-Observables
                if (x instanceof (rx.Observable as any)) {
                    value = this.materializeInnerObservable(value, this.scheduler.now());
                }
                actual.push({ frame: this.scheduler.now(), notification: Notification.createNext(value) });
            }, (err) => {
                actual.push({ frame: this.scheduler.now(), notification: Notification.createError(err) });
            }, () => {
                actual.push({ frame: this.scheduler.now(), notification: Notification.createComplete() });
            });
            return subscription;
        });
        (this.scheduler as any).clock += 1;

        if (unsubscriptionFrame !== Number.POSITIVE_INFINITY) {
            this.scheduler.scheduleFuture(
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
            messages.push({ frame: this.scheduler.now() - outerFrame, notification: Notification.createNext(value) });
        }, (err) => {
            messages.push({ frame: this.scheduler.now() - outerFrame, notification: Notification.createError(err) });
        }, () => {
            messages.push({ frame: this.scheduler.now() - outerFrame, notification: Notification.createComplete() });
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
                // if (materializeInnerObservables && values[x] instanceof getColdObservableClass(rx)) {
                if (materializeInnerObservables && values[x].subscribe && values[x].messages) {
                    return values[x].messages.map(recordToTestMessage(rx));
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

function recordToTestMessage(rx: typeof Rx) {
    return function (msg: Rx.Recorded): TestMessage {
        let n: Notification<any>;

        (msg.value as Rx.Notification<any>).accept(
            value => n = Notification.createNext(value),
            err => n = Notification.createError(err),
            () => n = Notification.createComplete(),
        );

        return {
           frame: msg.time,
           notification: n
        };
    };
}

function logSubscription<T>(rx: typeof Rx, scheduler: Rx.IScheduler, obs: Rx.Observable<T>): Rx.Observable<T> {
    const subscriptions: SubscriptionLog[] = [];
    const so = rx.Observable.create<T>(observer => {
        const sl = new SubscriptionLog(scheduler.now());
        const index = subscriptions.push(sl) - 1;
        const sub = obs.subscribe(observer);
        return () => {
            subscriptions[index].unsubscribedFrame = scheduler.now();
            sub.dispose();
        };
    });
    (so as any).subscriptions = subscriptions;
    // if (obs instanceof getColdObservableClass(rx)) {
        (so as any).messages = (obs as any).messages;
    // }
    return so;
}
