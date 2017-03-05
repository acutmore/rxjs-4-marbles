/// <reference path="../node_modules/rx/ts/rx.all.d.ts" />

export function getHotObservableClass(rx: typeof Rx) {
    const ts = new rx.TestScheduler();
    const ho = ts.createHotObservable();
    return ho.constructor;
}
