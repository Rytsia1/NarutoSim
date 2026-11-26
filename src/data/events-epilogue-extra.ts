import type { RetirementEventDef } from './events-epilogue';

export const EXTRA_RETIREMENT_EVENTS: readonly RetirementEventDef[] = [
  {
    id: 'ret_ramen_regular',
    title: 'The Regular Stool at the Noodle Stand',
    body: 'Steam fogs the shop curtains as the young cook slides over a bowl without asking your order.',
    options: [
      { id: 'tip_generously', label: 'Leave extra silver and swap jokes with the off-duty Genin', autoEligible: true, stats: { bonds: 5, health: 2 }, resultText: 'Warm broth and noisy laughter keep winter out of your bones.' },
      { id: 'eat_quietly', label: 'Enjoy the bowl quietly before heading home before dusk', autoEligible: true, stats: { health: 4, will: 2 }, resultText: 'Simple peace tastes sweeter than any banquet.' },
    ],
  },
  {
    id: 'ret_wood_carving',
    title: 'Carving Cedar Figurines',
    body: 'Hands that once wove lightning seals now turn scrap cedar into small wooden foxes and frogs on your porch.',
    options: [
      { id: 'gift_kids', label: 'Hand them out to neighborhood children after Academy hours', autoEligible: true, stats: { bonds: 6, will: 2 }, resultText: 'Half the street now carries your tiny wooden charms tied to their packs.' },
      { id: 'sell_market', label: 'Display your finest carvings at the autumn stall', autoEligible: true, stats: { ryo: 6, intel: 2 }, resultText: 'Shoppers marvel at the precision of every chisel line.' },
    ],
  },
  {
    id: 'ret_academy_lecture',
    title: 'Guest Lecture at the Academy',
    body: 'An Academy instructor invites you to speak for one afternoon on surviving real missions beyond textbook drills.',
    options: [
      { id: 'teach_teamwork', label: 'Speak honestly about fear, preparation, and trusting your squad', autoEligible: true, stats: { bonds: 6, will: 4 }, resultText: 'Thirty young eyes stay glued to your scarred knuckles from start to finish.' },
      { id: 'demo_seals', label: 'Demonstrate clean, zero-waste hand seals at slow speed', autoEligible: true, stats: { intel: 5, chakra: 2 }, resultText: 'Even the instructors furiously copy down your finger transitions.' },
    ],
  },
  {
    id: 'ret_spring_garden',
    title: 'Herb Beds Behind the Fence',
    body: 'Instead of trap wires, your backyard now holds neat rows of mint, ginger, and mountain medicinal herbs.',
    options: [
      { id: 'tend_clinic', label: 'Donate fresh bundles to the village hospital each month', autoEligible: true, stats: { bonds: 5, health: 3 }, resultText: 'Young medics greet you by name whenever you push open the clinic gate.' },
      { id: 'brew_tea', label: 'Dry the finest leaves for your own winter tonic', autoEligible: true, stats: { health: 6 }, resultText: 'Your breathing stays steady even when freezing rain lashes the shutters.' },
    ],
  },
  {
    id: 'ret_old_rival_letter',
    title: 'An Unmarked Letter Across the Border',
    body: 'A weathered envelope arrives without a village seal, signed with the old callsign of a shinobi you once fought to a standstill.',
    options: [
      { id: 'write_reply', label: 'Write back wishing them quiet knees and warm tea', autoEligible: true, stats: { will: 5, bonds: 4 }, resultText: 'Old enemies who survive long enough share a language no peacetime clerk understands.' },
      { id: 'burn_letter', label: 'Smile once and feed the paper into the charcoal brazier', autoEligible: true, stats: { will: 5 }, resultText: 'Some chapters read best left sealed.' },
    ],
  },
  {
    id: 'ret_shogi_park',
    title: 'Shogi Beneath the Ginkgo Tree',
    body: 'Retired Chunin and elders gather daily on stone benches for ruthless three-hour shogi matches.',
    options: [
      { id: 'play_sharp', label: 'Sacrifice a rook boldly to spring a six-move trap', autoEligible: true, stats: { intel: 6, bonds: 3 }, resultText: 'An old tactician slaps his knee and insists on an immediate rematch.' },
      { id: 'watch_games', label: 'Sip barley tea and kibitz gently from the bench', autoEligible: true, stats: { bonds: 4, health: 2 }, resultText: 'Golden ginkgo leaves drift down across the wooden board.' },
    ],
  },
  {
    id: 'ret_rainy_scar',
    title: 'Old Wounds Before a Storm',
    body: 'Before the first thundercloud clears the ridge, an old war scar along your shoulder begins to ache steadily.',
    options: [
      { id: 'hot_spring', label: 'Soak for an hour in the cedar hot springs above town', autoEligible: true, stats: { health: 6, ryo: -3 }, resultText: 'Mineral steam loosens the knots decades of service left behind.' },
      { id: 'stretch_drills', label: 'Run through slow kata forms until warmth returns', autoEligible: true, stats: { health: 3, will: 4 }, resultText: 'Discipline still answers whenever you call on it.' },
    ],
  },
  {
    id: 'ret_festival_lanterns',
    title: 'Summer Lantern Festival',
    body: 'Paper lanterns bob down the canal while drums echo across the main square in celebration of another peaceful harvest.',
    options: [
      { id: 'float_lantern', label: 'Set a white lantern afloat for fallen comrades', autoEligible: true, stats: { will: 5, bonds: 5 }, resultText: 'Hundreds of tiny flames drift gently toward the bend in the river.' },
      { id: 'watch_fireworks', label: 'Claim a quiet rooftop seat and watch the bursts of gold', autoEligible: true, stats: { health: 3, will: 3 }, resultText: 'Fire in the sky means celebration now, not signal flares.' },
    ],
  },
  {
    id: 'ret_dusty_headband',
    title: 'Polishing the Scratched Steel',
    body: 'While clearing a top shelf, you uncover your very first forehead protector wrapped inside faded cloth.',
    options: [
      { id: 'display_shelf', label: 'Set it neatly beside the family teapot in plain sight', autoEligible: true, stats: { will: 5, bonds: 2 }, resultText: 'Every scratch across the metal marks a day you refused to fold.' },
      { id: 'pass_down', label: 'Gift the cloth wrap to a nervous Academy graduate down the lane', autoEligible: true, stats: { bonds: 7, will: 3 }, resultText: 'The kid wears it like armor on their very first training run.' },
    ],
  },
  {
    id: 'ret_council_consult',
    title: 'A Quiet Question From the {kage} Desk',
    body: 'A runner brings a sealed dispatch asking your private opinion on a tense frontier treaty.',
    requiresJonin: true,
    options: [
      { id: 'advise_restraint', label: 'Urge patient border diplomacy backed by quiet deterrence', autoEligible: true, stats: { intel: 6, bonds: 4 }, resultText: 'Weeks later, border watchtowers stand down without a single kunai drawn.' },
      { id: 'advise_fortify', label: 'Draft a sharp barrier-line contingency just in case', autoEligible: true, stats: { intel: 5, will: 4 }, resultText: 'Your ink notes go straight into the village defense archive.' },
    ],
  },
  {
    id: 'ret_stray_cats',
    title: 'Alley Cats on the Sunlit Wall',
    body: 'Three scarred tabby cats have decided your sunny courtyard wall is their sovereign territory.',
    options: [
      { id: 'feed_fish', label: 'Set out scraps of grilled mackerel every evening', autoEligible: true, stats: { bonds: 4, health: 3 }, resultText: 'By autumn, even the grumpiest one-eared tomcat naps beside your sandals.' },
      { id: 'let_them_nap', label: 'Leave them in peace and sketch them with charcoal', autoEligible: true, stats: { intel: 3, will: 3 }, resultText: 'Quiet afternoons slip by cleanly.' },
    ],
  },
  {
    id: 'ret_old_training_post',
    title: 'Return to Training Ground Three',
    body: 'On a crisp morning walk, you find the scarred cedar posts from your Genin days still standing beside the river.',
    options: [
      { id: 'trace_marks', label: 'Run a palm across the old kunai notches and remember your youth', autoEligible: true, stats: { will: 6, bonds: 3 }, resultText: 'You can almost hear your Sensei’s dry voice scolding your footwork.' },
      { id: 'repair_post', label: 'Replace the rotting target rope for the next generation', autoEligible: true, stats: { bonds: 5, health: 2 }, resultText: 'Fresh hemp rope awaits tomorrow’s Academy drills.' },
    ],
  },
  {
    id: 'ret_winter_snow_shovel',
    title: 'Heavy Snow on the Neighbor’s Roof',
    body: 'A deep mountain snowfall threatens to buckle the porch beams of an elderly baker across the alley.',
    options: [
      { id: 'clear_roof', label: 'Climb up with careful chakra footing and clear the drift', autoEligible: true, stats: { bonds: 6, health: -1, will: 3 }, resultText: 'Warm sweet buns arrive at your doorstep for the rest of January.' },
      { id: 'call_youth', label: 'Organize three local Genin to clear the whole block for silver', autoEligible: true, stats: { bonds: 5, ryo: -3 }, resultText: 'The kids turn snow-clearing into a loud race down the eaves.' },
    ],
  },
  {
    id: 'ret_fishing_dock',
    title: 'Still Water at the River Bend',
    body: 'With no mission clocks left to watch, you spend a bright morning dangling a bamboo line off the wooden dock.',
    options: [
      { id: 'patient_catch', label: 'Wait calmly until afternoon for a silver river carp', autoEligible: true, stats: { health: 5, will: 4 }, resultText: 'Patience learned in ambush stalks turns out to suit fishing just as well.' },
      { id: 'nap_sun', label: 'Pull your straw hat over your eyes and doze to the current', autoEligible: true, stats: { health: 6 }, resultText: 'No fish caught, yet it feels like the finest morning in years.' },
    ],
  },
  {
    id: 'ret_scroll_donation',
    title: 'Sorting a Lifetime of Scrolls',
    body: 'Stacked cedar trunks hold decades of elemental notes, counter-seals, and hand-drawn border sketches.',
    options: [
      { id: 'donate_library', label: 'Donate the clean tactical manuals to the village library', autoEligible: true, stats: { bonds: 7, intel: 3 }, resultText: 'Young Chunin study your margin diagrams long after your hair turns snow-white.' },
      { id: 'keep_private', label: 'Seal the dangerous entries away so no reckless youth misuses them', autoEligible: true, stats: { will: 6, intel: 2 }, resultText: 'Some hard lessons are better locked under wax.' },
    ],
  },
  {
    id: 'ret_market_haggle',
    title: 'Morning Market Haggling',
    body: 'A loud radish vendor tries to charge veteran prices for bruised autumn turnips.',
    options: [
      { id: 'sharp_bargain', label: 'Flash a calm Jonin eyebrow until the price drops cleanly in half', autoEligible: true, stats: { ryo: 5, intel: 2 }, resultText: 'The vendor laughs nervously and tosses in fresh leeks for free.' },
      { id: 'pay_full', label: 'Pay full coin with a smile to help a struggling stall', autoEligible: true, stats: { bonds: 5, ryo: -2 }, resultText: 'Peace thrives when ordinary shops keep their shutters open.' },
    ],
  },
  {
    id: 'ret_bamboo_flute',
    title: 'Evening Flute Across the Roofs',
    body: 'A neighbor plays a slow, wistful bamboo flute melody as purple twilight settles over the village.',
    options: [
      { id: 'listen_porch', label: 'Sit silently on the wooden step until the final note fades', autoEligible: true, stats: { will: 5, health: 3 }, resultText: 'The melody carries memories of rain, campfires, and friends long gone.' },
      { id: 'join_tea', label: 'Bring two cups of hot tea next door and applaud softly', autoEligible: true, stats: { bonds: 6 }, resultText: 'A quiet friendship blooms across the courtyard fence.' },
    ],
  },
  {
    id: 'ret_monument_flowers',
    title: 'Fresh Moss on the Memorial Stone',
    body: 'Rain leaves pale green moss creeping across the lower names carved into the village Memorial Stone.',
    options: [
      { id: 'scrub_stone', label: 'Spend the morning gently scrubbing every letter clean with rainwater', autoEligible: true, stats: { will: 6, bonds: 5 }, resultText: 'No name carved in sacrifice fades while you still have strength in your hands.' },
      { id: 'leave_incense', label: 'Light three sticks of sandalwood incense and bow silently', autoEligible: true, stats: { will: 5, health: 2 }, resultText: 'Thin blue smoke curls calmly into the grey morning sky.' },
    ],
  },
  {
    id: 'ret_young_hothead',
    title: 'A Reckless Genin Picks a Quarrel',
    body: 'A loud new Genin bumps your shoulder in the lane, bragging about wanting a real war to prove their worth.',
    options: [
      { id: 'quiet_truth', label: 'Show them one pale scar and ask whose grave they want to dig first', autoEligible: true, stats: { will: 5, bonds: 4 }, resultText: 'The boast dies cleanly in their throat; they bow and walk away wiser.' },
      { id: 'buy_dango', label: 'Buy them a skewer of sweet dango and tell them peacetime is the real victory', autoEligible: true, stats: { bonds: 6, ryo: -2 }, resultText: 'Halfway through the skewer, the kid starts listening instead of shouting.' },
    ],
  },
  {
    id: 'ret_spouse_portrait',
    title: 'An Ink Portrait in Autumn',
    body: 'A traveling painter offers to sketch you and your spouse beneath the crimson maple tree by the canal.',
    requiresSpouse: true,
    options: [
      { id: 'sit_portrait', label: 'Sit side by side holding hands while ink captures the afternoon', autoEligible: true, stats: { bonds: 8, ryo: -4 }, resultText: 'Framed in cedar wood, the portrait becomes the quiet heart of your home.' },
    ],
  },
  {
    id: 'ret_roof_leak',
    title: 'Patching Shingles Before Monsoon',
    body: 'A loose cedar shingle rattles over your kitchen just as dark clouds gather over the valley.',
    options: [
      { id: 'climb_patch', label: 'Climb up yourself with hammer and pitch before the rain hits', autoEligible: true, stats: { health: 2, will: 3 }, resultText: 'Dry floorboards all season long.' },
      { id: 'hire_carpenter', label: 'Pay the young apprentice carpenter down the lane to fix it right', autoEligible: true, stats: { bonds: 4, ryo: -3, health: 3 }, resultText: 'The roof holds tight while you stay dry beside the kettle.' },
    ],
  },
  {
    id: 'ret_summon_visit',
    title: 'A Familiar Puff of Smoke in the Garden',
    body: 'A small woodland creature pauses on your fence post, tilting its head as though checking whether an old shinobi still remembers the mountain trails.',
    options: [
      { id: 'offer_rice', label: 'Set out a saucer of sweet rice and share a quiet nod', autoEligible: true, stats: { chakra: 3, bonds: 4 }, resultText: 'Old trails and old pacts linger softly in memory.' },
      { id: 'smile_wave', label: 'Tip your teacup toward the peaks and smile', autoEligible: true, stats: { will: 4, health: 2 }, resultText: 'A cool breeze sweeps down from the high crags.' },
    ],
  },
  {
    id: 'ret_old_weapon_forge',
    title: 'Retiring the War Blade',
    body: 'Your old campaign kunai and short blade sit oiled on linen. A village smith offers to reforge the steel into kitchen knives or preserve them as heirlooms.',
    options: [
      { id: 'reforge_kitchen', label: 'Reforge the war iron into a balanced kitchen blade', autoEligible: true, stats: { bonds: 5, health: 3, will: 4 }, resultText: 'Steel that once ended lives now slices winter radish and warm bread.' },
      { id: 'seal_heirloom', label: 'Wrap the blade in oiled silk inside a cedar box', autoEligible: true, stats: { will: 5 }, resultText: 'It rests cleanly in the dark, hoping never to be drawn again.' },
    ],
  },
  {
    id: 'ret_village_census',
    title: 'The Young Historian’s Interview',
    body: 'A bright-eyed village clerk asks to confirm dates and squad names from an old border campaign.',
    options: [
      { id: 'name_squadmates', label: 'Make sure every quiet comrade gets credit before your own name', autoEligible: true, stats: { bonds: 7, will: 4 }, trustAllTeam: 4, resultText: 'History will remember the whole line, not just the loudest legends.' },
      { id: 'correct_maps', label: 'Correct three badly drawn river crossings on their parchment', autoEligible: true, stats: { intel: 5 }, resultText: 'The historian leaves thrilled with accurate frontier notes.' },
    ],
  },
  {
    id: 'ret_cherry_blossoms',
    title: 'Petals Across the Tea Cup',
    body: 'Spring wind shakes a pale cloud of cherry petals across your veranda until one settles gently atop your green tea.',
    options: [
      { id: 'savor_moment', label: 'Lift the cup slowly and breathe in the spring air', autoEligible: true, stats: { health: 5, will: 4 }, resultText: 'To grow old in a shinobi village is a quiet miracle all its own.' },
    ],
  },
  {
    id: 'ret_midnight_watch_habit',
    title: 'Awake at the Third Watch',
    body: 'Years after hanging up your vest, you still wake naturally at two in the morning listening to wind through the pines.',
    options: [
      { id: 'walk_perimeter', label: 'Stroll gently around the sleeping lane until your pulse settles', autoEligible: true, stats: { will: 4, health: 2 }, resultText: 'Only crickets and lantern light answer; the village sleeps safely.' },
      { id: 'warm_milk', label: 'Heat a mug of barley water and read by candlelight', autoEligible: true, stats: { intel: 3, health: 3 }, resultText: 'Old reflexes soften gently into quiet evenings.' },
    ],
  },
  {
    id: 'ret_chunin_finals_spectator',
    title: 'Cheering From the Arena Railing',
    body: 'The Chunin Exam Finals return to the village stadium, drawing roaring crowds under bright banners.',
    options: [
      { id: 'cheer_underdog', label: 'Applaud loudest for the stubborn underdog who refuses to stay down', autoEligible: true, stats: { bonds: 5, will: 4 }, resultText: 'Their grin from the arena sand looks unmistakably like your own decades ago.' },
      { id: 'study_new_jutsu', label: 'Analyze the clever new elemental combinations younger shinobi invent', autoEligible: true, stats: { intel: 5 }, resultText: 'The next generation always finds a brighter spark.' },
    ],
  },
  {
    id: 'ret_medic_checkup',
    title: 'Stubborn Visit to the Clinic',
    body: 'A brisk medical-nin corners you at the market and insists on checking the old chakra strain in your lungs.',
    options: [
      { id: 'follow_orders', label: 'Swallow your pride and take their herbal regimen seriously', autoEligible: true, stats: { health: 7, ryo: -3 }, resultText: 'Two weeks later, climbing the hill stairs feels noticeably lighter.' },
      { id: 'laugh_off', label: 'Assure them you are tougher than cedar bark', autoEligible: true, stats: { will: 4, health: -1 }, resultText: 'The medic sighs and slips a packet of root tea into your sleeve anyway.' },
    ],
  },
  {
    id: 'ret_first_snow_tea',
    title: 'First Snow on the Pine Needles',
    body: 'Silent white flakes drift across the courtyard pond while a charcoal kettle hums indoors.',
    options: [
      { id: 'invite_neighbors', label: 'Wave over two neighbors to share roasted sweet potatoes by the hearth', autoEligible: true, stats: { bonds: 6, health: 3 }, resultText: 'Warmth and easy conversation fill the small house until nightfall.' },
      { id: 'write_poem', label: 'Brush three simple lines of ink about snow and quiet steel', autoEligible: true, stats: { intel: 4, will: 4 }, resultText: 'The paper dries neatly beside your window.' },
    ],
  },
  {
    id: 'ret_bridge_stroll',
    title: 'Sunset Over the Stone Bridge',
    body: 'Merchants pack up their carts beneath orange clouds as children chase fireflies along the riverbank.',
    options: [
      { id: 'lean_railing', label: 'Lean on the warm stone rail and watch the fireflies rise', autoEligible: true, stats: { will: 5, health: 4 }, resultText: 'Everything you bled for is laughing loudly down by the reeds.' },
    ],
  },
  {
    id: 'ret_passing_torch',
    title: 'An Old Notebook for a New Jonin',
    body: 'A newly promoted Jonin knocks respectfully at your gate, asking how you carried the weight of command without breaking.',
    requiresJonin: true,
    options: [
      { id: 'hand_notebook', label: 'Hand over your annotated field journal with one firm clasp of the hand', autoEligible: true, stats: { bonds: 7, will: 5 }, resultText: 'The fire passes cleanly into steadier, younger hands.' },
    ],
  },
  {
    id: 'ret_autumn_harvest',
    title: 'Persimmons Drying Under the Eaves',
    body: 'Bright orange persimmons hang on hemp strings beneath your porch roof, catching the crisp October sun.',
    options: [
      { id: 'share_basket', label: 'Bring a woven basket to the local orphanage before frost hits', autoEligible: true, stats: { bonds: 7, will: 3 }, resultText: 'Sticky smiles and bright shouts echo down the lane behind you.' },
      { id: 'store_winter', label: 'Pack them neatly into cedar jars for quiet winter nights', autoEligible: true, stats: { health: 5, ryo: 3 }, resultText: 'Sweet dried fruit carries you comfortably through the cold months.' },
    ],
  },
];
