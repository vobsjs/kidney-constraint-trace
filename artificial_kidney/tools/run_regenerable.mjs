#!/usr/bin/env node
/**
 * STAGE 9 -- the regenerable sorbent: mass limit -> power limit.
 *
 * CHECK 8   The physiological anchor: what does a kidney actually spend?
 * CHECK 9   The inverted specification: what energy per gram would fit that budget?
 * CHECK 10  Forward sweep: power and battery mass as a function of an energy figure
 *           that is SWEPT, never claimed.
 * CHECK 11  The two kinds of constraint side by side, and a mass sanity check
 *           against a real wearable device.
 *
 * Run:  node artificial_kidney/tools/run_regenerable.mjs
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..', '..')

const {
  KIDNEY_POWER,
  BATTERY,
  WAK_REFERENCE,
  CARTRIDGE_MASS,
  energyPerKgFromPower,
  powerFromEnergyPerKg,
  batteryMassKg,
  compareConstraints,
} = await import(pathToFileURL(join(REPO, 'artificial_kidney', 'regenerable.mjs')).href)
const { UREA_GENERATION } = await import(
  pathToFileURL(join(REPO, 'artificial_kidney', 'modules.mjs')).href
)

const line = (s = '') => process.stdout.write(s + '\n')
const pad = (v, n) => String(v).padStart(n)

// ---------------------------------------------------------------- check 8
line('CHECK 8  The physiological anchor')
line('='.repeat(76))
line('  What a kidney spends, so there is something honest to aim at:')
line()
line(`    resting whole-body VO2        ${KIDNEY_POWER.restingVo2MlPerMin} mL/min`)
line(`    renal share of that           ${(KIDNEY_POWER.renalOxygenFraction.low * 100).toFixed(0)}-${(KIDNEY_POWER.renalOxygenFraction.high * 100).toFixed(0)}%`)
line(`    oxidative energy              ${KIDNEY_POWER.kJPerLitreO2} kJ per litre O2`)
line()
line(`    => renal power budget         ${KIDNEY_POWER.lowW.toFixed(1)} - ${KIDNEY_POWER.highW.toFixed(1)} W` +
  `   (mid ${KIDNEY_POWER.midW.toFixed(1)} W)`)
line()
line('  A kidney has NO cartridge to replace, but it CANNOT exceed this budget. That')
line('  is the sense in which "mass -> power" is structurally closer to biology: the')
line('  limiting resource becomes the one biology is also limited by.')
line()
line(`  daily urea to remove            ${UREA_GENERATION.gUreaPerDay.toFixed(1)} g/day`)
line()

// ---------------------------------------------------------------- check 9
line('CHECK 9  The inverted specification -- no electrochemistry assumed')
line('='.repeat(76))
line('  Energy per kg of urea that would exactly fit a given continuous power:')
line()
line(`    ${'power budget'.padStart(14)} ${'required energy'.padStart(17)}`)
for (const p of [KIDNEY_POWER.lowW, KIDNEY_POWER.midW, KIDNEY_POWER.highW, 20, 50]) {
  const label = p <= KIDNEY_POWER.highW + 0.01 ? `${p.toFixed(1)} W (kidney)` : `${p.toFixed(0)} W`
  line(`    ${label.padStart(14)} ${pad(energyPerKgFromPower(p).toFixed(1) + ' kWh/kg', 17)}`)
}
line()
const spec = energyPerKgFromPower(KIDNEY_POWER.midW)
line(`  SPECIFICATION: electrochemical urea removal must achieve <= ${spec.toFixed(1)} kWh per kg`)
line(`  of urea to fit inside the budget a kidney itself operates under (~${KIDNEY_POWER.midW.toFixed(0)} W).`)
line()
line('  This is a REQUIREMENT, not a measurement. No energy-per-gram figure for')
line('  electrochemical urea oxidation could be sourced -- the NSF PAR copy was')
line('  unreachable and one open-access PDF was CID-glyph encoded -- so none is claimed.')
line()

// ---------------------------------------------------------------- check 10
line('CHECK 10 Forward sweep (the energy figure is SWEPT, never claimed)')
line('='.repeat(76))
line(`  ${'energy (kWh/kg)'.padStart(16)} ${'power (W)'.padStart(10)} ${'Wh/day'.padStart(9)} ` +
  `${'battery (kg)'.padStart(13)}  fits kidney budget?`)
for (const e of [1, 2, 5, 10, 16, 20, 30, 50, 100]) {
  const p = powerFromEnergyPerKg(e)
  const b = batteryMassKg(e)
  line(`  ${pad(e, 16)} ${pad(p.toFixed(1), 10)} ${pad(b.whPerDay.toFixed(0), 9)} ` +
    `${pad(b.massKg.toFixed(2), 13)}  ${e <= spec ? 'YES' : 'no'}`)
}
line()
line(`  A 1 kg Li-ion pack (${BATTERY.whPerKg} Wh/kg, ${BATTERY.basis}) holds ${BATTERY.whPerKg} Wh,`)
line(`  i.e. ${(BATTERY.whPerKg / 24).toFixed(1)} W sustained for 24 h. The kidney budget is`)
line(`  ${KIDNEY_POWER.midW.toFixed(0)} W, so the battery mass is ${(batteryMassKg(spec).massKg).toFixed(2)} kg at the specification.`)
line()

// ---------------------------------------------------------------- check 11
line('CHECK 11 The two constraints side by side')
line('='.repeat(76))
const cmp = compareConstraints({ energyKWhPerKg: spec })
line(`  over ${cmp.days} days:`)
line()
line(`    ${''.padEnd(26)} ${'disposable'.padStart(14)} ${'regenerable'.padStart(14)}`)
line(`    ${'carried mass (kg)'.padEnd(26)} ${pad(CARTRIDGE_MASS.totalKg.toFixed(2), 14)} ${pad(cmp.regenerable.carriedKg.toFixed(2), 14)}`)
line(`    ${'resupplied over 30 d (kg)'.padEnd(26)} ${pad(cmp.disposable.resuppliedKg.toFixed(1), 14)} ${pad('0.0', 14)}`)
line(`    ${'cartridge changes'.padEnd(26)} ${pad(cmp.disposable.cartridges.toFixed(1), 14)} ${pad('0', 14)}`)
line(`    ${'continuous power (W)'.padEnd(26)} ${pad('-', 14)} ${pad(cmp.regenerable.continuousPowerW.toFixed(1), 14)}`)
line(`    ${'consignment'.padEnd(26)} ${'replaced'.padStart(14)} ${'recharged'.padStart(14)}`)
line()
line(`  cartridge breakdown: ZP ${CARTRIDGE_MASS.zirconiumPhosphateG} g + charcoal ${CARTRIDGE_MASS.charcoalG} g +`)
line(`    HZO/alumina ${CARTRIDGE_MASS.hzoAluminaG} g + urease/alumina ${CARTRIDGE_MASS.ureaseAluminaG} g`)
line()
line('  THE STRUCTURAL DIFFERENCE IS NOT MASS -- the two are comparable. It is that')
line('  sorbent mass is CONSUMED and must be resupplied, while battery mass is CARRIED')
line('  and recharged. The resupply column is the one that changes kind.')
line()

line('  MASS SANITY CHECK against a device that actually reached clinical trials:')
line(`    ${WAK_REFERENCE.basis}`)
line(`    mass ${WAK_REFERENCE.massKg} kg, water ${WAK_REFERENCE.waterMl} mL, regenerator: ${WAK_REFERENCE.regenerator}, ${WAK_REFERENCE.trial}`)
line(`    our modelled sorbent cartridge alone: ${CARTRIDGE_MASS.totalKg.toFixed(2)} kg`)
line(`    -> ${(CARTRIDGE_MASS.totalKg / WAK_REFERENCE.massKg * 100).toFixed(0)}% of the whole device budget, leaving ` +
  `${(WAK_REFERENCE.massKg - CARTRIDGE_MASS.totalKg).toFixed(1)} kg for pump, dialyzer, battery, water and housing.`)
line(`    A PLAUSIBLE total, which is the only claim being made -- the WAK carried a`)
line(`    disposable sorbent, so this checks the mass SCALE, not the regenerable path.`)
line()

// ---------------------------------------------------------------- honesty
line('WHAT THIS STAGE DID AND DID NOT CHANGE')
line('='.repeat(76))
line('  CHANGED')
line('    the KIND of limit          mass -> power')
line('    the clinical consequence   no cartridge changes; a continuous power budget')
line('    the failure mode           was "consumable run out"; now "budget exceeded"')
line()
line('  NOT CHANGED')
line('    selectivity                electrochemistry has no molecular recognition')
line('    reabsorption               still DESTROYS urea; a tubule RECLAIMS solute')
line('    endocrine/metabolic        absent')
line('    regulation                 still a sink, not a setpoint controller')
line()
line('  CORRECTION TO STAGE 6: regeneration was described there as "the tubular')
line('  reabsorption analogue". THAT WAS A FALSE ANALOGY. A tubule reclaims glucose,')
line('  amino acids, bicarbonate and water via molecular recognition; a sorbent or an')
line('  electrode destroys urea. The two are opposite functions. Dialysate')
line('  regeneration has no renal counterpart, and is now labelled as such.')
line()
line('  WHAT IS NOT CLAIMED: that any electrochemical system meets the specification.')
line('  No energy-per-gram figure was sourced, so the specification stands as an open')
line('  requirement against which real devices can be measured when data exists.')
