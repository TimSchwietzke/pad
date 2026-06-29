import { act, renderHook } from '@testing-library/react'
import { usePersistentState } from './usePersistentState'

describe('usePersistentState', () => {
  it('uses the fallback when nothing is stored', () => {
    const { result } = renderHook(() => usePersistentState('k', 'a'))
    expect(result.current[0]).toBe('a')
  })

  it('supports a lazy fallback', () => {
    const { result } = renderHook(() => usePersistentState('k', () => 'lazy'))
    expect(result.current[0]).toBe('lazy')
  })

  it('persists updates to localStorage', () => {
    const { result } = renderHook(() => usePersistentState('k', 'a'))
    act(() => result.current[1]('b'))
    expect(result.current[0]).toBe('b')
    expect(JSON.parse(localStorage.getItem('k')!)).toBe('b')
  })

  it('restores a stored value on init', () => {
    localStorage.setItem('k', JSON.stringify('stored'))
    const { result } = renderHook(() => usePersistentState('k', 'a'))
    expect(result.current[0]).toBe('stored')
  })
})
