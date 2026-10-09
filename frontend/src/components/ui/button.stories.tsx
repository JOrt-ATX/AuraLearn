import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

const meta = {
  title: 'Base/Button',
  component: Button,
  args: { children: 'Save' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'],
    },
    size: { control: 'select', options: ['default', 'sm', 'lg', 'icon'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Destructive: Story = { args: { variant: 'destructive', children: 'Delete' } };
export const Outline: Story = { args: { variant: 'outline' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Disabled: Story = { args: { disabled: true } };
export const IconOnly: Story = {
  args: { size: 'icon', variant: 'outline', 'aria-label': 'Search', children: <SearchIcon /> },
};
