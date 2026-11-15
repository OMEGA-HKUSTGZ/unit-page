// Data for the Analysis section and the training-data strip, from the IJCV 2026
// version of the paper. Tables 1 and 10-14 are copied from the paper's tables.
// Fig. 12 is only given as a plot, so its curves were read from the marker
// centres of the full-resolution figure (unchanged from Fig. 10 of the arXiv
// version), calibrated on its gridlines; they are accurate to about ±0.001 m.
window.UNIT_ANALYSIS = {
  loss: {
    table: 'Table 11',
    note: '(Acc. + Comp.) / 2 on 7-Scenes, NRGBD and DTU; lower is better.',
    columns: [
      ['Offline', 'Scale-invariant'],
      ['Offline', 'Metric scale'],
      ['Online', 'Scale-invariant'],
      ['Online', 'Metric scale'],
    ],
    rows: [
      { label: 'Direct regression', values: [0.053, 0.201, 0.067, 0.433], avg: 0.188 },
      { label: 'Scale-adaptive design', values: [0.044, 0.108, 0.069, 0.147], avg: 0.092 },
      { label: '+ Shuffled normal loss', values: [0.046, 0.108, 0.07, 0.141], avg: 0.091, ours: true },
    ],
  },
  modal: {
    table: 'Table 10',
    note: 'Average of (Acc. + Comp.) / 2 over image-only and multi-modal inputs, both scale settings, on 7-Scenes, NRGBD and DTU.',
    rows: [
      { label: 'Linear projection ×4', parts: [false, false, true], values: [0.05, 0.117, 0.037, 0.092], avg: 0.074 },
      { label: 'Cross attention ×4', parts: [true, false, true], values: [0.04, 0.109, 0.036, 0.095], avg: 0.07 },
      { label: 'Cross attn. + concat. ×1', parts: [true, true, false], values: [0.048, 0.107, 0.035, 0.088], avg: 0.069 },
      { label: 'Modal attention ×4', parts: [true, true, true], values: [0.046, 0.108, 0.033, 0.088], avg: 0.068, ours: true },
    ],
    partNames: ['Cross attention', 'Concatenation', 'Four stages'],
    columns: [['Image only', 'S-Inv.'], ['Image only', 'Metric'], ['Multi-modal', 'S-Inv.'], ['Multi-modal', 'Metric']],
  },
  drop: {
    table: 'Table 12',
    note: 'Camera pose on ScanNetV2, 90 frames, queue capacity Q = 50.',
    metrics: ['ATE, scale-invariant', 'ATE, metric scale'],
    full: [0.037, 0.045],
    rows: [
      { label: 'Stride drop', values: [0.038, 0.046], ours: true },
      { label: 'Random drop', values: [0.041, 0.049] },
      { label: 'Token merge', values: [0.041, 0.05] },
      { label: 'First in, first out', values: [0.047, 0.057] },
    ],
  },
  queue: {
    figure: 'Fig. 12, top',
    note: 'Camera pose ATE (m) on ScanNetV2, 90 frames. Read from the figure, about ±0.001.',
    x: [1, 10, 20, 30, 40, 50, 60, 70, 80, 90],
    xLabel: 'queue capacity Q (frames)',
    series: {
      'Scale-invariant': [0.295, 0.159, 0.05, 0.036, 0.035, 0.036, 0.035, 0.035, 0.035, 0.034],
      'Metric scale': [0.341, 0.183, 0.059, 0.047, 0.046, 0.046, 0.046, 0.046, 0.045, 0.045],
    },
  },
  group: {
    figure: 'Fig. 12, bottom',
    note: 'Camera pose ATE (m) on ScanNetV2, 90 frames. Read from the figure, about ±0.001.',
    x: [1, 10, 20, 30, 40, 50, 60, 70, 80, 90],
    xLabel: 'group size G (frames)',
    series: {
      'Scale-invariant': [0.037, 0.034, 0.034, 0.033, 0.032, 0.032, 0.032, 0.031, 0.031, 0.031],
      'Metric scale': [0.045, 0.042, 0.042, 0.041, 0.04, 0.04, 0.039, 0.039, 0.038, 0.038],
    },
  },
  binocular: {
    table: 'Table 14',
    note: 'Camera pose on laboratory sequences of ETH3D-SLAM. G = 2 takes the two views of each time step as one group.',
    metrics: ['ATE', 'RPE trans.', 'RPE rot.'],
    columns: ['Scale-invariant', 'Metric scale'],
    rows: [
      { label: 'TTT3R', values: [[0.548, 0.316, 6.059], [0.645, 0.236, 6.059]] },
      { label: 'UniT, G = 1', values: [[0.374, 0.201, 7.067], [0.395, 0.206, 7.067]] },
      { label: 'UniT, G = 2', values: [[0.347, 0.197, 6.994], [0.363, 0.193, 6.994]], ours: true },
    ],
  },
  unified: {
    table: 'Table 13',
    note: '(Acc. + Comp.) / 2 on 7-Scenes, NRGBD and DTU; lower is better. Each specialized model is trained for one setting only.',
    columns: [
      ['Offline only', 'Scale-invariant'],
      ['Offline only', 'Metric scale'],
      ['Online only', 'Scale-invariant'],
      ['Online only', 'Metric scale'],
      ['Image only', 'Scale-invariant'],
      ['Image only', 'Metric scale'],
    ],
    rows: [
      { label: 'Specialized', values: [0.052, 0.113, 0.06, 0.184, 0.046, 0.097], avg: 0.092 },
      { label: 'Unified (UniT)', values: [0.046, 0.108, 0.07, 0.141, 0.046, 0.108], avg: 0.087, ours: true },
    ],
  },
  data: {
    table: 'Table 1',
    rows: [
      { name: 'ScanNet++', type: 'Indoor', scenes: 1006, real: true, dynamic: false, ratio: 8.2 },
      { name: 'ARKitScenes', type: 'Indoor', scenes: 1661, real: true, dynamic: false, ratio: 3.0 },
      { name: 'ScanNet', type: 'Indoor', scenes: 1513, real: true, dynamic: false, ratio: 5.9 },
      { name: 'Matterport3D', type: 'Indoor', scenes: 90, real: true, dynamic: false, ratio: 4.4 },
      { name: 'DynReplica', type: 'Indoor', scenes: 524, real: false, dynamic: true, ratio: 6.2 },
      { name: 'Hypersim', type: 'Indoor', scenes: 461, real: false, dynamic: false, ratio: 5.8 },
      { name: 'Waymo', type: 'Outdoor', scenes: 798, real: true, dynamic: true, ratio: 7.9 },
      { name: 'Mapfree', type: 'Outdoor', scenes: 460, real: true, dynamic: false, ratio: 6.2 },
      { name: 'VKITTI', type: 'Outdoor', scenes: 5, real: false, dynamic: true, ratio: 1.7 },
      { name: 'MVS-Synth', type: 'Outdoor', scenes: 120, real: false, dynamic: true, ratio: 3.6 },
      { name: 'ParaDomain4D', type: 'Outdoor', scenes: 1528, real: false, dynamic: true, ratio: 8.0 },
      { name: 'GTA-SfM', type: 'Outdoor', scenes: 200, real: false, dynamic: true, ratio: 4.9 },
      { name: 'MatrixCity', type: 'Outdoor', scenes: 24, real: false, dynamic: false, ratio: 3.9 },
      { name: 'Mid-Air', type: 'Outdoor', scenes: 7, real: false, dynamic: false, ratio: 4.9 },
      { name: 'UnrealStereo4K', type: 'Mixed', scenes: 9, real: false, dynamic: false, ratio: 1.0 },
      { name: 'TartanAir', type: 'Mixed', scenes: 1037, real: false, dynamic: true, ratio: 7.3 },
      { name: 'PointOdyssey', type: 'Mixed', scenes: 159, real: false, dynamic: true, ratio: 3.0 },
      { name: 'Spring', type: 'Mixed', scenes: 38, real: false, dynamic: true, ratio: 0.6 },
      { name: 'WildRGBD', type: 'Object', scenes: 2754, real: true, dynamic: false, ratio: 7.0 },
      { name: 'OmniObject3D', type: 'Object', scenes: 6000, real: false, dynamic: false, ratio: 3.3 },
      { name: 'HuMMan', type: 'Human', scenes: 907, real: true, dynamic: true, ratio: 3.0 },
    ],
  },
};
