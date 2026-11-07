import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePayoutInput, nextPayoutState } from '../services/razorpayPayoutRules.js';
const good = {fromAccNo:'1000000003',amount:'12.50',vpa:'person@bank',name:'Person',transactionPin:'123456',idempotencyKey:'db201812-0000-4000-8000-000000000001'};
test('validates amounts as exact paise', () => { assert.equal(validatePayoutInput(good).amountPaise,1250); assert.throws(()=>validatePayoutInput({...good,amount:'1.001'})); assert.throws(()=>validatePayoutInput({...good,amount:'0'})); });
test('rejects malformed VPA and identifiers', () => { assert.throws(()=>validatePayoutInput({...good,vpa:'bad'})); assert.throws(()=>validatePayoutInput({...good,idempotencyKey:'bad'})); });
test('terminal results do not regress and failure refunds only once', () => { assert.equal(nextPayoutState('RESERVED','processed'),'PROCESSED'); assert.equal(nextPayoutState('PROCESSED','reversed'),'PROCESSED'); assert.equal(nextPayoutState('RELEASED','processed'),'RELEASED'); assert.equal(nextPayoutState('PROCESSED','processing'),'PROCESSED'); assert.equal(nextPayoutState('RESERVED','unknown'),'RESERVED'); });
