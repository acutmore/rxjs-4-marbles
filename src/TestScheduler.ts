/// <reference path="../node_modules/rx/ts/rx.all.d.ts" />

import { getColdObservableClass } from './ColdObservable'
import { Notification } from './Notification';
import { SubscriptionLog } from './SubscriptionLog';

interface TestMessage {

}

type ColdObservable = any;
type HotObservable = any;

export type observableToBeFn = (marbles: string, values?: any, errorValue?: any) => void;
export type subscriptionLogsToBeFn = (marbles: string | string[]) => void

export function createTestScheduler(rx: typeof Rx) {
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
            // TODO 
        }

        createColdObservable(
            marbles: string,
            values?: any,
            error?: any
        ): ColdObservable {
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
            return new SubscriptionLog(-1, -1); // TODO - implement stub
        }
    }
}
