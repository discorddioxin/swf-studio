// @vitest-environment jsdom
// A panel that fails to render says what failed, inside the app: the message, the
// stack and the component stack are on screen and can be copied — the preview has
// no browser console to send the user to.
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

afterEach(cleanup);

function Lifter(): never {
  throw new ReferenceError('process is not defined');
}

it('shows the error, its stack and the failing component, and copies them', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

  render(<ErrorBoundary label="Execute Engine"><Lifter /></ErrorBoundary>);
  expect(screen.getByRole('alert').textContent).toContain('Execute Engine failed to render');
  expect(screen.getByText('ReferenceError: process is not defined', { selector: 'pre:not([aria-label])' })).toBeTruthy();
  const details = screen.getByLabelText('Error details');
  await waitFor(() => expect(details.textContent).toContain('Component stack:'));
  expect(details.textContent).toContain('Lifter');
  expect(details.textContent).toMatch(/Stack:\n.*process is not defined/);
  expect(screen.queryByText(/browser console/)).toBeNull();

  fireEvent.click(screen.getByText('Copy details'));
  await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());
  expect(writeText).toHaveBeenCalledWith(details.textContent);
});
