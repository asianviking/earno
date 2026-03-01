import { defineConfig } from 'vocs'

export default defineConfig({
  title: 'earno',
  sidebar: [
    {
      text: 'Quickstart',
      link: '/quickstart',
    },
    {
      text: 'Concepts',
      items: [
        { text: 'Trust boundary', link: '/concepts/trust-boundary' },
        { text: 'Action request', link: '/concepts/action-request' },
        { text: 'Link transport', link: '/concepts/link-transport' },
      ],
    },
    {
      text: 'Guides',
      items: [
        { text: 'CLI basics', link: '/guides/cli-basics' },
        { text: 'Plugins', link: '/guides/plugins' },
        { text: 'Web executor', link: '/guides/web-executor' },
        { text: 'Agent integration', link: '/guides/agents' },
      ],
    },
    {
      text: 'Reference',
      items: [{ text: 'Environment variables', link: '/reference/environment' }],
    },
  ],
})
