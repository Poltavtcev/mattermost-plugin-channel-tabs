import React from 'react';

import type {Tab} from '../types/tabs';
import {useTranslations} from '../hooks/useTranslations';

interface DeleteConfirmProps {
    tab: Tab | null;
    onConfirm: () => void;
    onCancel: () => void;
}

const DeleteConfirm: React.FC<DeleteConfirmProps> = ({tab, onConfirm, onCancel}) => {
    const t = useTranslations();

    if (!tab) {
        return null;
    }

    return (
        <div
            className='channel-tabs-modal-backdrop'
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onCancel();
                }
            }}
        >
            <div className='channel-tabs-modal' style={{width: 400}}>
                <div className='channel-tabs-confirm'>
                    <h3 style={{marginBottom: 12}}>{t('delete.title')}</h3>
                    <p>
                        {t('delete.confirm')}
                        <strong>{tab.title}</strong>
                        {t('delete.confirmEnd')}
                    </p>
                    <div className='channel-tabs-confirm__actions'>
                        <button
                            className='channel-tabs-modal__btn channel-tabs-modal__btn--secondary'
                            onClick={onCancel}
                        >
                            {t('delete.cancel')}
                        </button>
                        <button
                            className='channel-tabs-modal__btn channel-tabs-modal__btn--danger'
                            onClick={onConfirm}
                        >
                            {t('delete.delete')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DeleteConfirm;
