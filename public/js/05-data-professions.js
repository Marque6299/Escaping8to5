/* RAT RACE · 05-data-professions.js · RR.data.professions — the 3 starter professions (§1.9, §2.1 step 1.3).
   Teacher is the exact reference profile used by every acceptance test.
   Designed so STARTING cash flow lies between +$600 and +$1,800 (Teacher 919 · Nurse 1,027 · Software Engineer 1,458).
   monthlyPayment is NOT stored here: RR.schema.create computes it with RR.finance.pmt (F1) so data and math cannot drift. */
(function (RR) {
  'use strict';

  RR.data.professions = [
    {
      id: 'teacher', name: 'Teacher', icon: 'ic_book',
      blurb: 'Steady pay, summers to plan, and a mortgage to match.',
      cash: 3000, salary: 3500, baseLifestyleExpense: 800, childCount: 0,
      personalAssets: [ { label: 'Home', value: 100000 }, { label: 'Car', value: 8000 } ],
      debts: [
        { kind: 'HOME_MORTGAGE', label: 'Home Mortgage', structure: 'AMORTIZING', principal: 85000, apr: 0.065, termMonthsRemaining: 300, prepayable: true },
        { kind: 'STUDENT_LOAN',  label: 'Student Loan',  structure: 'AMORTIZING', principal: 12000, apr: 0.05,  termMonthsRemaining: 96,  prepayable: true },
        { kind: 'CAR_LOAN',      label: 'Car Loan',      structure: 'AMORTIZING', principal: 9000,  apr: 0.075, termMonthsRemaining: 36,  prepayable: true },
        { kind: 'CREDIT_CARD',   label: 'Credit Card',   structure: 'REVOLVING',  principal: 2500,  apr: 0.21,  termMonthsRemaining: null, prepayable: true }
      ]
    },
    {
      id: 'nurse', name: 'Nurse', icon: 'ic_heart_pulse',
      blurb: 'Higher pay, long shifts, and a bigger home loan.',
      cash: 3500, salary: 4100, baseLifestyleExpense: 850, childCount: 0,
      personalAssets: [ { label: 'Home', value: 130000 }, { label: 'Car', value: 12000 } ],
      debts: [
        { kind: 'HOME_MORTGAGE', label: 'Home Mortgage', structure: 'AMORTIZING', principal: 110000, apr: 0.065, termMonthsRemaining: 300, prepayable: true },
        { kind: 'STUDENT_LOAN',  label: 'Student Loan',  structure: 'AMORTIZING', principal: 18000,  apr: 0.05,  termMonthsRemaining: 96,  prepayable: true },
        { kind: 'CAR_LOAN',      label: 'Car Loan',      structure: 'AMORTIZING', principal: 11000,  apr: 0.075, termMonthsRemaining: 36,  prepayable: true },
        { kind: 'CREDIT_CARD',   label: 'Credit Card',   structure: 'REVOLVING',  principal: 3000,   apr: 0.21,  termMonthsRemaining: null, prepayable: true }
      ]
    },
    {
      id: 'software_engineer', name: 'Software Engineer', icon: 'ic_laptop',
      blurb: 'Big paycheck, big expenses \u2014 the lifestyle creep is real.',
      cash: 5000, salary: 6200, baseLifestyleExpense: 1300, childCount: 0,
      personalAssets: [ { label: 'Home', value: 220000 }, { label: 'Car', value: 18000 } ],
      debts: [
        { kind: 'HOME_MORTGAGE', label: 'Home Mortgage', structure: 'AMORTIZING', principal: 180000, apr: 0.065, termMonthsRemaining: 300, prepayable: true },
        { kind: 'STUDENT_LOAN',  label: 'Student Loan',  structure: 'AMORTIZING', principal: 28000,  apr: 0.05,  termMonthsRemaining: 96,  prepayable: true },
        { kind: 'CAR_LOAN',      label: 'Car Loan',      structure: 'AMORTIZING', principal: 16000,  apr: 0.075, termMonthsRemaining: 36,  prepayable: true },
        { kind: 'CREDIT_CARD',   label: 'Credit Card',   structure: 'REVOLVING',  principal: 4500,   apr: 0.21,  termMonthsRemaining: null, prepayable: true }
      ]
    }
  ];
  RR.data.defaultProfessionId = 'teacher';
})(window.RR);
