import type { Meta, StoryObj } from '@storybook/react-vite';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const meta = {
  title: 'Base/Input',
  component: Input,
  decorators: [
    (Story) => (
      <div className="flex max-w-sm flex-col gap-2">
        <Label htmlFor="email">Email *</Label>
        <Story />
      </div>
    ),
  ],
  args: { id: 'email', type: 'email', placeholder: 'name@atexis.com' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Invalid: Story = {
  args: { 'aria-invalid': true, 'aria-describedby': 'email-error', defaultValue: 'not-an-email' },
  decorators: [
    (Story) => (
      <>
        <Story />
        <p id="email-error" className="text-sm text-destructive">
          Enter a valid email address.
        </p>
      </>
    ),
  ],
};
