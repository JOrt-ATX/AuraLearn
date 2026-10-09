import type { Meta, StoryObj } from '@storybook/react-vite';

import { Skeleton } from '@/components/ui/skeleton';

const meta = {
  title: 'Base/Skeleton',
  component: Skeleton,
  args: { className: 'h-4 w-64' },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Line: Story = {};
export const Card: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-3 rounded-lg border p-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  ),
};
