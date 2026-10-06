/* RAT RACE · 05-data-dreams.js · RR.data.dreams — Fast Track dreams (§1.9). Cash purchase wins the game (Phase 4). */
(function (RR) {
  'use strict';

  RR.data.dreams = [
    { id: 'island_resort',     name: 'Private Island Resort',           cost: 600000, icon: 'ic_plane',    blurb: 'A small island, a dock, and nobody asking for your timesheet.' },
    { id: 'school_foundation', name: 'Community School Foundation',     cost: 900000, icon: 'ic_book',     blurb: 'Fund the school you wish every kid could attend.' },
    { id: 'mountain_ranch',    name: 'Mountain Ranch Retreat',          cost: 500000, icon: 'ic_house',    blurb: 'Quiet land, a long porch, and room for everyone you love.' },
    { id: 'world_yacht',       name: 'Round-the-World Sailing Yacht',   cost: 750000, icon: 'ic_globe',    blurb: 'Follow the trade winds. Let the portfolio pay for the ports.' }
  ];
  RR.data.defaultDreamId = 'island_resort';
})(window.RR);
