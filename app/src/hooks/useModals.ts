/**
 * Consolidated modal state management.
 * Replaces multiple useState booleans with a single state machine.
 */

import { useCallback, useState } from 'react';

export type ModalType = 'nudge' | 'gallery' | 'newCanvas' | null;

export interface UseModalsReturn {
  activeModal: ModalType;
  openModal: (modal: Exclude<ModalType, null>) => void;
  closeModal: () => void;
}

/**
 * Hook to manage modal state.
 * Only one modal can be open at a time.
 */
export function useModals(): UseModalsReturn {
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  const openModal = useCallback((modal: Exclude<ModalType, null>) => {
    setActiveModal(modal);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  return {
    activeModal,
    openModal,
    closeModal,
  };
}
