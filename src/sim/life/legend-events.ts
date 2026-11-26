import { GREAT_VILLAGES, VILLAGE_MAP } from '../../data/villages';
import { clampStats, diffStats, pushLog, recordMemory, snapshotStats } from '../history/chronicle';
import { clamp, computeCombatProjection } from '../powers';
import { promoteRank } from '../ranks';
import type { SeededRng } from '../rng';
import type { CheckResultChip, GameState, PendingDecision } from '../types';

export function getDisplayTitle(state: GameState): string {
  return state.epithet ? `${state.name} ("${state.epithet}")` : state.name;
}

/**
 * Checks for Prodigy milestones (Age 13 ANBU Captain), Jinchuriki childhood drama,
 * S-Rank Living Legend world reactions (Foreign Kage Peace Envoy / Anti-Legend Coalition),
 * and Point-Buy Drawback / Curse events.
 */
export function tryLegendOrDrawbackDecision(state: GameState, rng: SeededRng): PendingDecision | null {
  const proj = computeCombatProjection(state);
  const displayTitle = getDisplayTitle(state);
  const vName = VILLAGE_MAP[state.villageId].name;

  // 1. Prodigy Fast-Track: Youngest ANBU Captain (Ages 12-15, ala Itachi / Kakashi)
  if (
    state.age >= 12 &&
    state.age <= 15 &&
    (state.rank === 'chunin' || state.rank === 'jonin') &&
    state.specialStatus === 'none' &&
    !state.flags.anbu_captain_offered &&
    state.villageId !== 'waves' &&
    state.villageId !== 'uzushio' &&
    state.villageId !== 'iron' &&
    proj.score >= 76
  ) {
    state.flags.anbu_captain_offered = true;
    return {
      id: `legend_anbu_cap_${state.age}`,
      kind: 'legend_event',
      eventId: 'prodigy_anbu_captain',
      title: `Prodigy Appointment: Youngest ANBU Captain`,
      body: `At just age ${state.age}, your combat record already eclipses veteran field commanders. The ${vName} leadership summons you to a sealed chamber and slides a porcelain ANBU squad-captain mask across the table.`,
      manual: true,
      meta: { legendType: 'prodigy_anbu_captain' },
      options: [
        {
          id: 'accept_anbu_captain',
          label: 'Accept the ANBU Captain mask (Immediate Jonin + ANBU status, +6 Will, +4 Intel)',
          sublabel: 'Step into black-ops command years ahead of your generation.',
          statHints: ['Will', 'Intel'],
          autoEligible: true,
        },
        {
          id: 'decline_anbu_captain',
          label: 'Decline the shadows and stay beside regular village shinobi (+5 Bonds, +3 Will)',
          sublabel: 'Keep your path in the daylight.',
          statHints: ['Bonds', 'Will'],
          autoEligible: false,
        },
      ],
    };
  }

  // 2. Jinchuriki Childhood Ostracization Drama (Ages 5-12, optional toggle)
  if (state.jinchuriki?.ostracized && state.age >= 5 && state.age <= 12) {
    if (state.age >= 5 && state.age <= 8 && !state.usedEvents.includes('jinchuriki_ostracized_market')) {
      state.usedEvents.push('jinchuriki_ostracized_market');
      return {
        id: `legend_jinch_market_${state.age}`,
        kind: 'legend_event',
        eventId: 'jinchuriki_ostracized_market',
        title: `Vessel of ${state.jinchuriki.bijuuName}: Whispers in the Market`,
        body: `Shopkeepers pull their children indoors the instant you walk past the lantern stalls of ${vName}. Everyone knows ${state.jinchuriki.bijuuName} sleeps beneath the ink spiral on your skin, and their fear hangs heavier than any blade.`,
        manual: false,
        meta: { legendType: 'jinchuriki_ostracized_market' },
        options: [
          {
            id: 'endure_warmth',
            label: 'Smile through the cold stares and swear to earn their trust (+5 Bonds, +4 Will, +12 Harmony)',
            statHints: ['Bonds', 'Will'],
            autoEligible: true,
          },
          {
            id: 'harden_resolve',
            label: 'Turn their fear into fuel for unmatched strength (+6 Will, +4 Chakra, +6 Harmony)',
            statHints: ['Will', 'Chakra'],
            autoEligible: true,
          },
          {
            id: 'commune_bijuu',
            label: `Listen to ${state.jinchuriki.bijuuName} rumbling behind the seal (+8 Chakra, +15 Harmony, -2 Bonds)`,
            statHints: ['Chakra'],
            autoEligible: true,
          },
        ],
      };
    }

    if (state.age >= 9 && state.age <= 12 && !state.usedEvents.includes('jinchuriki_ostracized_swing')) {
      state.usedEvents.push('jinchuriki_ostracized_swing');
      return {
        id: `legend_jinch_swing_${state.age}`,
        kind: 'legend_event',
        eventId: 'jinchuriki_ostracized_swing',
        title: `The Lonely Swing Beneath the Academy Tree`,
        body: `After sparring drills, classmates cluster with their parents while you sit alone beneath the oak tree. Inside your mindscape, the immense chakra of ${state.jinchuriki.bijuuName} ripples against the iron bars, waiting for your answer.`,
        manual: false,
        meta: { legendType: 'jinchuriki_ostracized_swing' },
        options: [
          {
            id: 'endure_warmth',
            label: 'Vow to become someone the whole village cannot help but acknowledge (+6 Bonds, +4 Will, +12 Harmony)',
            statHints: ['Bonds', 'Will'],
            autoEligible: true,
          },
          {
            id: 'harden_resolve',
            label: 'Train past midnight until your shadow eclipses every rival (+6 Chakra, +5 Will, +8 Harmony)',
            statHints: ['Chakra', 'Will'],
            autoEligible: true,
          },
          {
            id: 'commune_bijuu',
            label: `Offer ${state.jinchuriki.bijuuName} a fist-bump across the seal (+10 Chakra, +18 Harmony)`,
            statHints: ['Chakra'],
            autoEligible: true,
          },
        ],
      };
    }
  }

  // 3. Point-Buy Drawbacks / Curses Periodic Arcs
  const drawbacks = state.drawbacks ?? [];
  if (drawbacks.length > 0 && state.age >= 11) {
    // 3a. Terminal Shinobi Illness (permanent tragic arc; treatments stabilize without curing)
    if (drawbacks.includes('illness') && state.age >= 13) {
      const lastAge = Number(state.usedFlavor.drawback_illness?.lastAge ?? 0);
      if (state.age - lastAge >= 4 && rng.chance(0.45)) {
        state.usedFlavor.drawback_illness = { count: (state.usedFlavor.drawback_illness?.count ?? 0) + 1, lastAge: state.age };
        const hasMedical = state.disciplines.some((d) => d.id === 'medical' && d.level >= 2);
        return {
          id: `db_illness_${state.age}`,
          kind: 'drawback_event',
          eventId: 'drawback_illness',
          title: 'Terminal Illness: Crimson Cough at Dawn',
          body: `A sharp spasm racks your chest after morning drills, spotting your sleeve with dark crimson. Physicians have confirmed your chakra-lung affliction can never be cured completely, only held at bay with disciplined treatment.`,
          manual: false,
          meta: { drawbackId: 'illness' },
          options: [
            {
              id: 'illness_stabilize',
              label: hasMedical
                ? 'Compound chakra suppressants yourself (Free with Medical Lv2+, -2 Health, Stabilized)'
                : 'Purchase rare suppressant medicines (-6 Ryo, -2 Health, Stabilized)',
              sublabel: 'Keeps the affliction under control for several years without eliminating it.',
              statHints: ['Health', 'Ryo'],
              disabled: !hasMedical && state.stats.ryo < 6,
              disabledReason: 'Requires 6 Ryo',
              autoEligible: hasMedical || state.stats.ryo >= 6,
            },
            {
              id: 'illness_rest',
              label: 'Withdraw for a season of strict recovery (+2 Health, -3 Chakra, Stabilized)',
              sublabel: 'Trades sharpness for extra years of life.',
              statHints: ['Health'],
              autoEligible: state.stats.health < 55,
            },
            {
              id: 'illness_push_through',
              label: 'Wipe the blood away and push your training harder (-8 Health, +6 Will, +4 Chakra)',
              sublabel: 'Burns your candle bright at both ends.',
              statHints: ['Will', 'Chakra'],
              autoEligible: state.stats.health >= 70,
            },
          ],
        };
      }
    }

    // 3b. Marked by Hunter-Nin
    if (drawbacks.includes('hunted_by_village') && state.age >= 11) {
      const lastAge = Number(state.usedFlavor.drawback_hunter?.lastAge ?? 0);
      if (state.age - lastAge >= 5 && rng.chance(0.42)) {
        state.usedFlavor.drawback_hunter = { count: (state.usedFlavor.drawback_hunter?.count ?? 0) + 1, lastAge: state.age };
        return {
          id: `db_hunter_${state.age}`,
          kind: 'drawback_event',
          eventId: 'drawback_hunted',
          title: 'Marked by Hunter-Nin: Masked Ambush',
          body: `Wire snaps across the cedar road ahead of you as three masked Hunter-Nin drop from the branches, holding a kill order bearing your likeness.`,
          manual: false,
          meta: { drawbackId: 'hunted_by_village' },
          options: [
            {
              id: 'hunter_fight',
              label: 'Stand your ground and break the hunter cell (Combat Power check)',
              statHints: ['Chakra', 'Will'],
              autoEligible: state.stats.health >= 55,
            },
            {
              id: 'hunter_evade',
              label: 'Detonate smoke tags and lose them across the river (+4 Intel, -4 Health)',
              statHints: ['Intel'],
              autoEligible: true,
            },
            {
              id: 'hunter_bribe',
              label: 'Pay an underground broker to plant false tracks (-7 Ryo, +3 Intel)',
              disabled: state.stats.ryo < 7,
              disabledReason: 'Requires 7 Ryo',
              autoEligible: state.stats.ryo >= 12,
            },
          ],
        };
      }
    }

    // 3c. Bound by Branch Seal (Caged Bird)
    if (drawbacks.includes('caged_bird') && state.age >= 11) {
      const lastAge = Number(state.usedFlavor.drawback_caged?.lastAge ?? 0);
      if (state.age - lastAge >= 6 && rng.chance(0.4)) {
        state.usedFlavor.drawback_caged = { count: (state.usedFlavor.drawback_caged?.count ?? 0) + 1, lastAge: state.age };
        return {
          id: `db_caged_${state.age}`,
          kind: 'drawback_event',
          eventId: 'drawback_caged_bird',
          title: 'Branch Seal Decree: The Elder Council',
          body: `A stinging pulse flares beneath your forehead bandage as senior elders summon you to yield credit for a high-profile mission to a main-house heir.`,
          manual: false,
          meta: { drawbackId: 'caged_bird' },
          options: [
            {
              id: 'caged_obey',
              label: 'Bow silently and fulfill branch duty (+5 Bonds, -3 Will)',
              statHints: ['Bonds'],
              autoEligible: false,
            },
            {
              id: 'caged_endure',
              label: 'Defy the decree through the searing seal pain (+7 Will, -6 Health)',
              statHints: ['Will'],
              autoEligible: state.stats.health >= 50,
            },
            {
              id: 'caged_leverage',
              label: 'Outmaneuver the elders publicly using village charter law (+5 Intel, -3 Bonds)',
              statHints: ['Intel'],
              autoEligible: true,
            },
          ],
        };
      }
    }

    // 3d. Volatile Chakra Pathways (Chakra Burnout)
    if (drawbacks.includes('chakra_burnout') && state.age >= 12) {
      const lastAge = Number(state.usedFlavor.drawback_burnout?.lastAge ?? 0);
      if (state.age - lastAge >= 5 && rng.chance(0.38)) {
        state.usedFlavor.drawback_burnout = { count: (state.usedFlavor.drawback_burnout?.count ?? 0) + 1, lastAge: state.age };
        return {
          id: `db_burnout_${state.age}`,
          kind: 'drawback_event',
          eventId: 'drawback_chakra_burnout',
          title: 'Volatile Tenketsu: Chakra Surge',
          body: `During a high-output jutsu test, raw chakra floods past your meridians like lightning down cracked stone, scorching your forearms.`,
          manual: false,
          meta: { drawbackId: 'chakra_burnout' },
          options: [
            {
              id: 'burnout_vent',
              label: 'Channel the surge into the training cliff (-6 Health, +6 Chakra)',
              statHints: ['Chakra'],
              autoEligible: state.stats.health >= 55,
            },
            {
              id: 'burnout_contain',
              label: 'Force the pathways shut by sheer willpower (-4 Health, +5 Will)',
              statHints: ['Will'],
              autoEligible: true,
            },
            {
              id: 'burnout_medical',
              label: 'Visit the chakra clinic for meridian realignment (-4 Ryo, +2 Health)',
              disabled: state.stats.ryo < 4,
              disabledReason: 'Requires 4 Ryo',
              autoEligible: state.stats.ryo >= 8,
            },
          ],
        };
      }
    }
  }

  // 4. S-Rank Living Legend World Reactions (Foreign Kage Peace Envoy & Anti-Legend Coalition)
  if (proj.threatTier === 'S' && state.age >= 14) {
    const foreignVillages = GREAT_VILLAGES.filter((v) => v.id !== state.villageId);
    const rivalVillage = rng.pick(foreignVillages);

    const lastEnvoyAge = Number(state.usedFlavor.legend_kage_envoy?.lastAge ?? 0);
    if (state.age - lastEnvoyAge >= 10 && rng.chance(0.36)) {
      state.usedFlavor.legend_kage_envoy = { count: (state.usedFlavor.legend_kage_envoy?.count ?? 0) + 1, lastAge: state.age };
      return {
        id: `legend_envoy_${state.age}`,
        kind: 'legend_event',
        eventId: 'legend_kage_envoy',
        title: `Living Legend: Envoy from ${rivalVillage.name}`,
        body: `Your S-Rank Bingo Book entry has reshaped continental strategy. A diplomatic courier bearing the seal of the ${rivalVillage.kageTitle} arrives at ${vName}, requesting an audience specifically with ${displayTitle} to prevent an open clash.`,
        manual: false,
        meta: { legendType: 'legend_kage_envoy', rivalVillageName: rivalVillage.name, rivalKage: rivalVillage.kageTitle },
        options: [
          {
            id: 'envoy_peace_pact',
            label: 'Sign a personal frontier non-aggression accord (-16 World Tension, +6 Bonds, +8 Ryo)',
            statHints: ['Bonds', 'Ryo'],
            autoEligible: true,
          },
          {
            id: 'envoy_deterrent',
            label: 'Release a brief pulse of chakra and tell them to keep their borders quiet (-10 Tension, +6 Will)',
            statHints: ['Will'],
            autoEligible: true,
          },
          {
            id: 'envoy_spar',
            label: 'Exchange techniques with the envoy escort in a ceremonial bout (+6 Chakra, +5 Intel, +4 Bonds)',
            statHints: ['Chakra', 'Intel'],
            autoEligible: true,
          },
        ],
      };
    }

    const lastCoalitionAge = Number(state.usedFlavor.legend_anti_coalition?.lastAge ?? 0);
    if (state.age >= 16 && state.age - lastCoalitionAge >= 9 && rng.chance(0.32)) {
      state.usedFlavor.legend_anti_coalition = {
        count: (state.usedFlavor.legend_anti_coalition?.count ?? 0) + 1,
        lastAge: state.age,
      };
      return {
        id: `legend_coalition_${state.age}`,
        kind: 'legend_event',
        eventId: 'legend_anti_coalition',
        title: `Living Legend: The Anti-Legend Coalition`,
        body: `Intercepted ANBU ciphers confirm that ${rivalVillage.name} and allied border commanders have formed a joint elimination coalition built for a single purpose: bringing down ${displayTitle} before the next war erupts.`,
        manual: false,
        meta: { legendType: 'legend_anti_coalition', rivalVillageName: rivalVillage.name },
        options: [
          {
            id: 'coalition_preempt',
            label: 'Dismantle their forward staging camp alone before sunrise (S-Rank Power Check)',
            sublabel: 'High-impact solo strike ala a living legend.',
            statHints: ['Chakra', 'Will'],
            autoEligible: state.stats.health >= 60,
          },
          {
            id: 'coalition_message',
            label: 'Pin your marked kunai to their command tent unannounced (+7 Will, -6 World Tension)',
            statHints: ['Will', 'Intel'],
            autoEligible: true,
          },
          {
            id: 'coalition_fortify',
            label: `Hand the ciphers to ${vName} command and fortify the border (+6 Intel, +5 Bonds)`,
            statHints: ['Intel', 'Bonds'],
            autoEligible: true,
          },
        ],
      };
    }
  }

  return null;
}

export function resolveLegendOrDrawbackDecision(
  state: GameState,
  decision: PendingDecision,
  optionId: string,
  rng: SeededRng,
  killFn: (state: GameState, cause: string) => void,
): void {
  const before = snapshotStats(state);
  const checks: CheckResultChip[] = [];

  if (decision.kind === 'legend_event') {
    const legendType = String(decision.meta?.legendType ?? decision.eventId);

    if (legendType === 'prodigy_anbu_captain') {
      if (optionId === 'accept_anbu_captain') {
        promoteRank(state, 'jonin');
        state.specialStatus = 'anbu';
        state.flags.anbu_captain = true;
        state.stats.will += 6;
        state.stats.intel += 4;
        state.stats.ryo += 6;
        clampStats(state);
        recordMemory(state, 'promotion', `Appointed youngest ANBU Captain of ${VILLAGE_MAP[state.villageId].name} at age ${state.age}.`);
        pushLog(
          state,
          'milestone',
          `You fasten the porcelain captain mask at age ${state.age}, stepping straight into Jonin rank and black-ops command as a generational prodigy.`,
          { title: 'Youngest ANBU Captain', deltas: diffStats(before, state.stats) },
        );
      } else {
        state.stats.bonds += 5;
        state.stats.will += 3;
        clampStats(state);
        pushLog(
          state,
          'bond',
          `You respectfully decline the ANBU Captain mask, choosing to walk in the sunlight alongside your comrades.`,
          { deltas: diffStats(before, state.stats) },
        );
      }
      return;
    }

    if (legendType === 'jinchuriki_ostracized_market' || legendType === 'jinchuriki_ostracized_swing') {
      const bijuu = state.jinchuriki?.bijuuName ?? 'the Tailed Beast';
      if (optionId === 'endure_warmth') {
        state.stats.bonds += 6;
        state.stats.will += 4;
        state.leanings.will_of_fire += 1;
        if (state.jinchuriki) state.jinchuriki.harmony = clamp(state.jinchuriki.harmony + 12, 0, 100);
        clampStats(state);
        pushLog(
          state,
          'bond',
          `You refuse to let fear define who you become. Even ${bijuu} falls thoughtfully quiet inside the seal as your resolve warms.`,
          { title: 'Jinchuriki Resolve', deltas: diffStats(before, state.stats) },
        );
      } else if (optionId === 'harden_resolve') {
        state.stats.will += 6;
        state.stats.chakra += 5;
        state.leanings.ambition += 1;
        if (state.jinchuriki) state.jinchuriki.harmony = clamp(state.jinchuriki.harmony + 8, 0, 100);
        clampStats(state);
        pushLog(
          state,
          'milestone',
          `Every whispered rumor only sharpens your focus. One day, the entire village will look up to your name.`,
          { title: 'Steel Beneath the Seal', deltas: diffStats(before, state.stats) },
        );
      } else {
        state.stats.chakra += 9;
        if (legendType === 'jinchuriki_ostracized_market') state.stats.bonds -= 2;
        if (state.jinchuriki) state.jinchuriki.harmony = clamp(state.jinchuriki.harmony + 16, 0, 100);
        clampStats(state);
        pushLog(
          state,
          'milestone',
          `In the stillness of your mindscape, you speak directly with ${bijuu}. The torrent of crimson chakra settles into a steadier rhythm (Harmony ${state.jinchuriki?.harmony ?? 0}%).`,
          { title: `Communion with ${bijuu}`, deltas: diffStats(before, state.stats) },
        );
      }
      return;
    }

    if (legendType === 'legend_kage_envoy') {
      const rivalV = String(decision.meta?.rivalVillageName ?? 'a rival nation');
      const prevT = state.world.tension;
      if (optionId === 'envoy_peace_pact') {
        state.world.tension = clamp(state.world.tension - 16, 5, 100);
        state.stats.bonds += 6;
        state.stats.ryo += 8;
      } else if (optionId === 'envoy_deterrent') {
        state.world.tension = clamp(state.world.tension - 10, 5, 100);
        state.stats.will += 6;
      } else {
        state.stats.chakra += 6;
        state.stats.intel += 5;
        state.stats.bonds += 4;
      }
      if (state.world.omenActive && state.world.tension < 65) state.world.omenActive = false;
      clampStats(state);
      const chips = [...diffStats(before, state.stats)];
      if (state.world.tension !== prevT) {
        chips.push({ stat: 'tension', label: 'World Tension', delta: state.world.tension - prevT });
      }
      pushLog(
        state,
        'milestone',
        `The ${rivalV} diplomatic delegation departs with newfound respect for ${getDisplayTitle(state)}. Word of the meeting ripples through every Kage office.`,
        { title: 'S-Rank Diplomatic Resonance', deltas: chips },
      );
      return;
    }

    if (legendType === 'legend_anti_coalition') {
      const rivalV = String(decision.meta?.rivalVillageName ?? 'rival nations');
      const prevT = state.world.tension;
      if (optionId === 'coalition_preempt') {
        const proj = computeCombatProjection(state);
        const passed = proj.score + rng.int(0, 25) >= 102;
        checks.push({ label: 'Solo Coalition Raid', passed });
        if (passed) {
          state.stats.will += 8;
          state.stats.chakra += 6;
          state.world.tension = clamp(state.world.tension - 8, 5, 100);
          clampStats(state);
          const chips = [...diffStats(before, state.stats)];
          if (state.world.tension !== prevT) {
            chips.push({ stat: 'tension', label: 'World Tension', delta: state.world.tension - prevT });
          }
          recordMemory(state, 'war', `Single-handedly dismantled an Anti-Legend Coalition staged by ${rivalV}.`);
          pushLog(
            state,
            'milestone',
            `Before dawn breaks, you scatter the entire ${rivalV} hunter coalition single-handedly. Survivors scramble home carrying fresh Run-on-Sight orders for ${getDisplayTitle(state)}.`,
            { title: 'Coalition Shattered Alone', deltas: chips, checks },
          );
        } else {
          state.stats.health -= 12;
          state.stats.will += 5;
          clampStats(state);
          if (state.stats.health <= 0) {
            killFn(state, `overwhelmed by an Anti-Legend Coalition from ${rivalV}`);
            return;
          }
          pushLog(
            state,
            'danger',
            `Their layered barrier traps catch your flank, forcing a bloodied withdrawal through the canyon, yet the coalition pays too steep a price to pursue.`,
            { title: 'Bloodied Coalition Clash', deltas: diffStats(before, state.stats), checks },
          );
        }
      } else if (optionId === 'coalition_message') {
        state.stats.will += 7;
        state.world.tension = clamp(state.world.tension - 6, 5, 100);
        clampStats(state);
        const chips = [...diffStats(before, state.stats)];
        if (state.world.tension !== prevT) {
          chips.push({ stat: 'tension', label: 'World Tension', delta: state.world.tension - prevT });
        }
        pushLog(
          state,
          'milestone',
          `The coalition commanders wake to find your signature kunai pinning their battle map to the table without a single sentry alerted. The alliance dissolves by noon.`,
          { title: 'Silent Deterrent', deltas: chips },
        );
      } else {
        state.stats.intel += 6;
        state.stats.bonds += 5;
        clampStats(state);
        pushLog(
          state,
          'bond',
          `Armed with your intelligence, village commanders reinforce every border pass and break the coalition before it can mobilize.`,
          { deltas: diffStats(before, state.stats) },
        );
      }
      return;
    }
  }

  // Drawback / Curse resolutions
  const dbId = String(decision.meta?.drawbackId ?? decision.eventId);
  if (dbId === 'illness') {
    const hasMedical = state.disciplines.some((d) => d.id === 'medical' && d.level >= 2);
    if (optionId === 'illness_stabilize') {
      if (!hasMedical) state.stats.ryo -= 6;
      state.stats.health -= 2;
      state.flags.illness_stabilized = true;
      clampStats(state);
      pushLog(
        state,
        'normal',
        `Bitter chakra suppressants steady your breathing and push the fever back. The illness remains coiled in your lungs, yet it buys you more years to finish your path.`,
        { title: 'Illness Stabilized', deltas: diffStats(before, state.stats) },
      );
    } else if (optionId === 'illness_rest') {
      state.stats.health += 2;
      state.stats.chakra -= 3;
      state.flags.illness_stabilized = true;
      clampStats(state);
      pushLog(
        state,
        'normal',
        `A quiet season away from heavy missions calms the spasms, keeping your terminal illness stabilized for now.`,
        { title: 'Quiet Convalescence', deltas: diffStats(before, state.stats) },
      );
    } else {
      state.stats.health -= 8;
      state.stats.will += 6;
      state.stats.chakra += 4;
      state.flags.illness_stabilized = false;
      clampStats(state);
      if (state.stats.health <= 0) {
        killFn(state, 'succumbed to terminal shinobi illness during relentless training');
        return;
      }
      pushLog(
        state,
        'danger',
        `You wipe the dark stain from your knuckles and refuse to slow down. Your techniques grow sharper even as your body quietly counts down the years.`,
        { title: 'Defying the Illness', deltas: diffStats(before, state.stats) },
      );
    }
    return;
  }

  if (dbId === 'hunted_by_village') {
    if (optionId === 'hunter_fight') {
      const proj = computeCombatProjection(state);
      const passed = proj.score + rng.int(0, 30) >= 62;
      checks.push({ label: 'Hunter-Nin Ambush Clash', passed });
      if (passed) {
        state.stats.will += 5;
        state.stats.chakra += 4;
        clampStats(state);
        pushLog(
          state,
          'milestone',
          `You sever the ambush wire mid-stride and force the masked Hunter-Nin cell to scatter into the canopy.`,
          { title: 'Ambush Broken', deltas: diffStats(before, state.stats), checks },
        );
      } else {
        state.stats.health -= 14;
        state.stats.will += 2;
        clampStats(state);
        if (state.stats.health <= 0) {
          killFn(state, 'cut down by a rival Hunter-Nin elimination squad');
          return;
        }
        pushLog(
          state,
          'danger',
          `Poisoned senbon graze your shoulder before you break their encirclement and escape into the treeline.`,
          { title: 'Narrow Escape from Hunters', deltas: diffStats(before, state.stats), checks },
        );
      }
    } else if (optionId === 'hunter_evade') {
      state.stats.intel += 4;
      state.stats.health -= 4;
      clampStats(state);
      if (state.stats.health <= 0) {
        killFn(state, 'bleeding out while fleeing a Hunter-Nin pursuit squad');
        return;
      }
      pushLog(
        state,
        'normal',
        `You vanish down the rushing gorge under a veil of smoke tags, leaving the Hunter-Nin cell slashing empty mist.`,
        { deltas: diffStats(before, state.stats) },
      );
    } else {
      state.stats.ryo -= 7;
      state.stats.intel += 3;
      clampStats(state);
      pushLog(
        state,
        'normal',
        `A quiet pouch of Ryo redirects the hunter trackers onto a false border trail for the season.`,
        { deltas: diffStats(before, state.stats) },
      );
    }
    return;
  }

  if (dbId === 'caged_bird') {
    if (optionId === 'caged_obey') {
      state.stats.bonds += 5;
      state.stats.will -= 3;
      clampStats(state);
      pushLog(
        state,
        'normal',
        `You swallow your pride and step aside for the main house, keeping peace inside the compound at the cost of quiet resentment.`,
        { deltas: diffStats(before, state.stats) },
      );
    } else if (optionId === 'caged_endure') {
      state.stats.will += 7;
      state.stats.health -= 6;
      clampStats(state);
      if (state.stats.health <= 0) {
        killFn(state, 'collapsed under the torment of the Branch Seal');
        return;
      }
      pushLog(
        state,
        'danger',
        `Even as the curse seal burns white-hot across your brow, you refuse to kneel. Even the elders fall silent before your glare.`,
        { title: 'Unbroken Beneath the Seal', deltas: diffStats(before, state.stats) },
      );
    } else {
      state.stats.intel += 5;
      state.stats.bonds -= 3;
      clampStats(state);
      pushLog(
        state,
        'milestone',
        `You cite official village mission records in open council, leaving the elders unable to bury your achievement.`,
        { deltas: diffStats(before, state.stats) },
      );
    }
    return;
  }

  // chakra_burnout
  if (optionId === 'burnout_vent') {
    state.stats.health -= 6;
    state.stats.chakra += 6;
    state.bodyStrain += 1;
    clampStats(state);
    if (state.stats.health <= 0) {
      killFn(state, 'catastrophic chakra pathway rupture during training');
      return;
    }
    pushLog(
      state,
      'danger',
      `You blast the overflowing chakra straight into the cliff face, carving a smoking crater while your meridians ache fiercely.`,
      { title: 'Volatile Release', deltas: diffStats(before, state.stats) },
    );
  } else if (optionId === 'burnout_contain') {
    state.stats.health -= 4;
    state.stats.will += 5;
    clampStats(state);
    if (state.stats.health <= 0) {
      killFn(state, 'internal meridian collapse from volatile chakra burnout');
      return;
    }
    pushLog(
      state,
      'normal',
      `Teeth clenched, you wrestle the runaway surge back down your coils before it can tear your arms apart.`,
      { deltas: diffStats(before, state.stats) },
    );
  } else {
    state.stats.ryo -= 4;
    state.stats.health += 2;
    clampStats(state);
    pushLog(
      state,
      'normal',
      `Medical-nin acupuncture cools your overheated tenketsu before permanent nerve damage sets in.`,
      { deltas: diffStats(before, state.stats) },
    );
  }
}
