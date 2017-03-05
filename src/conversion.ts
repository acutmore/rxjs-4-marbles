/// <reference path="../node_modules/rx/ts/rx.all.d.ts" />

import { TestMessage } from './TestMessage';

export function testMessageToRecord(rx: typeof Rx) {
    return function (msg: TestMessage): Rx.Recorded {
        return msg.notification.do(
            (value) => rx.ReactiveTest.onNext(msg.frame, value),
            (error) => rx.ReactiveTest.onError(msg.frame, error),
            () => rx.ReactiveTest.onCompleted(msg.frame)
        );
    };
}