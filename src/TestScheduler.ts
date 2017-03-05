
import { SubscriptionLog } from './SubscriptionLog';

interface TestMessage {

}

type ColdObservable = any;
type HotObservable = any;

export type observableToBeFn = (marbles: string, values?: any, errorValue?: any) => void;
export type subscriptionLogsToBeFn = (marbles: string | string[]) => void

export class TestScheduler {

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
        return [];
    }

    static parseMarblesAsSubscriptions(
        marbles: string
    ): SubscriptionLog {
        return new SubscriptionLog(-1, -1); // TODO - implement stub
    }

}