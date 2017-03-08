/// <reference path="../node_modules/rx/ts/rx.all.d.ts" />

import { expect } from 'chai';
import Rx = require('rx');
import { TestScheduler } from '../src/TestScheduler';
import { Notification } from '../src/Notification';

/** @test {TestScheduler} */
describe('custom TestScheduler', () => {
  let
    rxjs4TestScheduler: Rx.TestScheduler,
    rxTestScheduler: TestScheduler,
    time,
    hot,
    cold,
    expectObservable,
    expectSubscriptions;

  const onNext = Rx.ReactiveTest.onNext,
        onCompleted = Rx.ReactiveTest.onCompleted,
        subscribe = Rx.ReactiveTest.subscribe;

  beforeEach(function() {
    rxTestScheduler = TestScheduler.default();
    rxjs4TestScheduler = rxTestScheduler.scheduler;

    const test = this.currentTest.fn;
    this.currentTest.fn = function() {
      test();
      rxTestScheduler.flush();        
    };

    time = rxTestScheduler.createTime.bind(rxTestScheduler);
    hot = rxTestScheduler.createHotObservable.bind(rxTestScheduler);
    cold = rxTestScheduler.createColdObservable.bind(rxTestScheduler);
    expectObservable = rxTestScheduler.expectObservable.bind(rxTestScheduler);
    expectSubscriptions = rxTestScheduler.expectSubscriptions.bind(rxTestScheduler);
  });

  it('should exist', () => {
    expect(TestScheduler).exist;
    expect(TestScheduler).to.be.a('function');
  });


  describe('interchangability with rxjs 4', () => {
    it('createColdObservable', () => {
      const logger = (bucket :any[]) => value => bucket.push({ value, time: rxjs4TestScheduler.now() });

      const o1 = rxjs4TestScheduler.createColdObservable(
        onNext(20, '1'),
        onNext(40, '2'),
        onNext(80, '3'),
        onCompleted(100)
      );

      const o1values = [];
      const o1Logger = logger(o1values);
      o1.subscribe(o1Logger, () => o1Logger(new Error()), () => o1Logger(void 0));

      const o2 = cold('--1-2---3-|');
      const o2values = [];
      const o2Logger = logger(o2values);
      o2.subscribe(o2Logger, () => o2Logger(new Error()), () => o2Logger(void 0));

      rxjs4TestScheduler.start();

      expect(o1values.length).to.eql(4);
      expect(o2values).to.deep.equal(o1values);
    });
  })
});
