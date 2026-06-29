import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// The docs sidebar — ordered so a new developer reads top-to-bottom:
// overview → concepts → architecture → extension guides → ops.
const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    {
      type: 'category',
      label: 'Core Concepts',
      collapsed: false,
      items: [
        'concepts/race-and-scoring',
        'concepts/tasks-and-grading',
        'concepts/multi-agent-pipeline',
        'concepts/fairness',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      collapsed: false,
      items: [
        'architecture/overview',
        'architecture/engine',
        'architecture/agents',
        'architecture/worker',
        'architecture/stage',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: false,
      items: ['reference/task-catalog'],
    },
    {
      type: 'category',
      label: 'Extending',
      collapsed: false,
      items: ['extending/add-a-task', 'extending/data', 'extending/providers'],
    },
    {
      type: 'category',
      label: 'Operations',
      collapsed: false,
      items: ['ops/running', 'ops/testing', 'ops/security'],
    },
  ],
};

export default sidebars;
