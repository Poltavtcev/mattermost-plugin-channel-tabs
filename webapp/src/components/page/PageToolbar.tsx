import React from 'react';

import {useTranslations} from '../../hooks/useTranslations';

interface PageToolbarProps {
    title: string;
    canEdit: boolean;
    onEdit: () => void;
    onBack: () => void;
}

const PageToolbar: React.FC<PageToolbarProps> = ({title, canEdit, onEdit, onBack}) => {
    const t = useTranslations();

    return (
        <div className='page-toolbar'>
            <button
                className='page-toolbar__back'
                onClick={onBack}
                title={t('page.backToTabs')}
            >
                {t('page.back')}
            </button>
            <h3 className='page-toolbar__title'>{title}</h3>
            {canEdit && (
                <button
                    className='page-toolbar__edit-btn'
                    onClick={onEdit}
                >
                    {t('page.editPage')}
                </button>
            )}
        </div>
    );
};

export default PageToolbar;
