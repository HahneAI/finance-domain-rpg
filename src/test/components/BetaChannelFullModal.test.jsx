import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BetaChannelFullModal } from '../../components/BetaChannelFullModal.jsx'

describe('BetaChannelFullModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<BetaChannelFullModal channel="flyer" open={false} onClose={() => {}} />)
    expect(container.textContent).toBe('')
  })

  it('primary CTA closes the modal so the visitor continues on the normal free trial, no special param', () => {
    const onClose = vi.fn()
    render(<BetaChannelFullModal channel="flyer" open onClose={onClose} />)
    fireEvent.click(screen.getByText(/Start My Free Trial/i))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<BetaChannelFullModal channel="flyer" open onClose={onClose} />)
    // Portaled to document.body (createPortal), not the RTL render container.
    fireEvent.click(document.body.querySelector('.fold-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  describe('flyer channel', () => {
    it('states the flyer pool is full, plainly, with no fake scarcity numbers', () => {
      render(<BetaChannelFullModal channel="flyer" open onClose={() => {}} />)
      expect(screen.getByText(/flyer beta is full/i)).toBeTruthy()
      expect(screen.getByText(/every flyer beta seat has been claimed/i)).toBeTruthy()
      // No hardcoded seat count baked into the copy (e.g. "All 20 seats") —
      // that number can drift if the pool size ever changes.
      expect(screen.queryByText(/20/)).toBeNull()
    })

    it('secondary CTA links out to the real website beta page as a genuine second chance, not a consolation prize', () => {
      render(<BetaChannelFullModal channel="flyer" open onClose={() => {}} />)
      expect(screen.getByText(/website beta runs on its own separate pool/i)).toBeTruthy()
      const link = screen.getByText(/Check the Website Beta/i)
      expect(link.getAttribute('href')).toBe('https://authority-os.com/products/beta')
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
    })
  })

  describe('website channel', () => {
    it('states the website pool is full, plainly, with no fake scarcity numbers', () => {
      render(<BetaChannelFullModal channel="website" open onClose={() => {}} />)
      expect(screen.getByText(/website beta is full/i)).toBeTruthy()
      expect(screen.getByText(/every website beta seat has been claimed/i)).toBeTruthy()
      expect(screen.queryByText(/20/)).toBeNull()
    })

    it('nods to the flyer pool as plain honest info, with no invented link to click', () => {
      render(<BetaChannelFullModal channel="website" open onClose={() => {}} />)
      expect(screen.getByText(/flyer beta runs on its own separate pool/i)).toBeTruthy()
      expect(screen.queryByText(/Check the Website Beta/i)).toBeNull()
      expect(screen.queryByRole('link')).toBeNull()
    })
  })
})
