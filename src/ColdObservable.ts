/// <reference path="../node_modules/rx/ts/rx.all.d.ts" />

export function getColdObservableClass(rx: typeof Rx) {
    const ts = new rx.TestScheduler();
    const co = ts.createColdObservable();
    return co.constructor;
}
