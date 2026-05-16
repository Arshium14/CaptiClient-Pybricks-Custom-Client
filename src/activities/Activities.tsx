// SPDX-License-Identifier: MIT
// Copyright (c) 2022-2023 The Pybricks Authors

import './activities.scss';
import { Icon, Tab, Tabs } from '@blueprintjs/core';
import React, { useCallback, useEffect, useRef } from 'react';
import Explorer from '../explorer/Explorer';
import Home from '../home/Home';
import Settings from '../settings/Settings';
import { Activity, useActivitiesSelectedActivity } from './hooks';
import { useI18n } from './i18n';

const MdFolderRounded = React.memo(function MdFolderRounded() {
    return (
        <svg
            className="pb-activities-md-icon"
            viewBox="0 0 24 24"
            width="35"
            height="35"
            aria-hidden="true"
        >
            <path d="M4 20C3.45 20 2.98 19.8 2.59 19.41C2.2 19.02 2 18.55 2 18V6C2 5.45 2.2 4.98 2.59 4.59C2.98 4.2 3.45 4 4 4H9.18C9.45 4 9.71 4.05 9.96 4.16C10.2 4.27 10.42 4.42 10.6 4.6L12 6H20C20.55 6 21.02 6.2 21.41 6.59C21.8 6.98 22 7.45 22 8V18C22 18.55 21.8 19.02 21.41 19.41C21.02 19.8 20.55 20 20 20H4Z" />
        </svg>
    );
});

const MdSettingsRounded = React.memo(function MdSettingsRounded() {
    return (
        <svg
            className="pb-activities-md-icon"
            viewBox="0 0 24 24"
            width="35"
            height="35"
            aria-hidden="true"
        >
            <path d="M10.05 21.85C9.73 21.85 9.45 21.75 9.21 21.55C8.98 21.35 8.84 21.1 8.8 20.8L8.55 18.9C8.3 18.8 8.06 18.68 7.84 18.55C7.61 18.42 7.38 18.28 7.15 18.12L5.38 18.88C5.1 19 4.81 19 4.52 18.89C4.23 18.78 4.01 18.6 3.85 18.32L1.9 14.98C1.73 14.7 1.68 14.41 1.74 14.1C1.81 13.8 1.97 13.55 2.23 13.35L3.75 12.2C3.73 12.07 3.72 11.94 3.72 11.82V11.05C3.72 10.93 3.73 10.8 3.75 10.67L2.23 9.52C1.97 9.32 1.81 9.07 1.74 8.77C1.68 8.46 1.73 8.17 1.9 7.9L3.85 4.55C4.01 4.28 4.23 4.09 4.52 3.98C4.81 3.87 5.1 3.88 5.38 4L7.15 4.75C7.38 4.6 7.61 4.46 7.84 4.33C8.06 4.2 8.3 4.08 8.55 3.98L8.8 2.08C8.84 1.78 8.98 1.53 9.21 1.33C9.45 1.13 9.73 1.03 10.05 1.03H13.95C14.27 1.03 14.55 1.13 14.79 1.33C15.02 1.53 15.16 1.78 15.2 2.08L15.45 3.98C15.7 4.08 15.94 4.2 16.16 4.33C16.39 4.46 16.62 4.6 16.85 4.75L18.63 4C18.9 3.88 19.19 3.87 19.48 3.98C19.77 4.09 19.99 4.28 20.15 4.55L22.1 7.9C22.27 8.17 22.32 8.46 22.26 8.77C22.19 9.07 22.03 9.32 21.77 9.52L20.25 10.67C20.27 10.8 20.28 10.93 20.28 11.05V11.82C20.28 11.94 20.27 12.07 20.25 12.2L21.77 13.35C22.03 13.55 22.19 13.8 22.26 14.1C22.32 14.41 22.27 14.7 22.1 14.98L20.15 18.32C19.99 18.6 19.77 18.78 19.48 18.89C19.19 19 18.9 19 18.63 18.88L16.85 18.12C16.62 18.28 16.39 18.42 16.16 18.55C15.94 18.68 15.7 18.8 15.45 18.9L15.2 20.8C15.16 21.1 15.02 21.35 14.79 21.55C14.55 21.75 14.27 21.85 13.95 21.85H10.05ZM12 15.5C13.1 15.5 14.04 15.11 14.83 14.33C15.61 13.54 16 12.6 16 11.5C16 10.4 15.61 9.46 14.83 8.67C14.04 7.89 13.1 7.5 12 7.5C10.9 7.5 9.96 7.89 9.17 8.67C8.39 9.46 8 10.4 8 11.5C8 12.6 8.39 13.54 9.17 14.33C9.96 15.11 10.9 15.5 12 15.5Z" />
        </svg>
    );
});

const MdHomeRounded = React.memo(function MdHomeRounded() {
    return (
        <svg
            className="pb-activities-md-icon"
            viewBox="0 0 24 24"
            width="35"
            height="35"
            aria-hidden="true"
        >
            <path d="M6 20C5.45 20 4.98 19.8 4.59 19.41C4.2 19.02 4 18.55 4 18V10.2C4 9.88 4.07 9.58 4.22 9.3C4.37 9.02 4.58 8.78 4.85 8.6L10.85 4.1C11.2 3.83 11.58 3.7 12 3.7C12.42 3.7 12.8 3.83 13.15 4.1L19.15 8.6C19.42 8.78 19.63 9.02 19.78 9.3C19.93 9.58 20 9.88 20 10.2V18C20 18.55 19.8 19.02 19.41 19.41C19.02 19.8 18.55 20 18 20H14.5C14.22 20 14 19.78 14 19.5V15C14 14.45 13.8 13.98 13.41 13.59C13.02 13.2 12.55 13 12 13C11.45 13 10.98 13.2 10.59 13.59C10.2 13.98 10 14.45 10 15V19.5C10 19.78 9.78 20 9.5 20H6Z" />
        </svg>
    );
});

/**
 * React component that acts as a tab control to select activities.
 */
const Activities: React.FunctionComponent = () => {
    const [selectedActivity, setSelectedActivity] = useActivitiesSelectedActivity();
    const i18n = useI18n();

    const handleAction = useCallback(
        (newActivity: Activity) => {
            // if activity is already selected, select none
            if (selectedActivity === newActivity) {
                setSelectedActivity(Activity.None);
            } else {
                // otherwise select the new activity
                setSelectedActivity(newActivity);
            }
        },
        [selectedActivity, setSelectedActivity],
    );

    // HACK: fix keyboard focus when no tab is selected

    const tabsRef = useRef<Tabs>(null);

    useEffect(() => {
        if (selectedActivity !== Activity.None) {
            // all is well
            return;
        }

        // @ts-expect-error: using private property
        const tablist: HTMLDivElement = tabsRef.current?.tablistElement;

        // istanbul-ignore-if: should not happen
        if (!tablist) {
            return;
        }

        const firstTab = tablist
            .getElementsByClassName('pb-activities-tablist-tab')
            .item(0);

        // istanbul-ignore-if: should not happen
        if (!firstTab) {
            return;
        }

        firstTab.setAttribute('tabindex', '0');
    }, [tabsRef, selectedActivity]);

    // HACK: hoist html title attribute from icon to tab

    useEffect(() => {
        // @ts-expect-error: using private property
        const tablist: HTMLDivElement = tabsRef.current?.tablistElement;

        // istanbul-ignore-if: should not happen
        if (!tablist) {
            return;
        }

        for (const element of tablist.getElementsByClassName(
            'pb-activities-tablist-tab',
        )) {
            const title = element.firstElementChild?.getAttribute('title');

            // istanbul-ignore-if: should not happen
            if (!title) {
                continue;
            }

            element.setAttribute('title', title);
            element.firstElementChild?.removeAttribute('title');
        }
    }, [tabsRef]);

    useEffect(() => {
        // @ts-expect-error: using private property
        const tablist: HTMLDivElement = tabsRef.current?.tablistElement;

        // istanbul-ignore-if: should not happen
        if (!tablist) {
            return;
        }

        tablist.setAttribute('aria-label', i18n.translate('title'));
    }, [i18n]);

    return (
        <Tabs
            vertical={true}
            className="pb-activities"
            selectedTabId={selectedActivity}
            renderActiveTabPanelOnly={true}
            onChange={handleAction}
            ref={tabsRef}
        >
            <Tab
                itemID="pb-activities-home-tab"
                aria-label={i18n.translate('home')}
                className="pb-activities-tablist-tab"
                id={Activity.Home}
                title={
                    <Icon htmlTitle={i18n.translate('home')} icon={<MdHomeRounded />} />
                }
                panel={<Home />}
                panelClassName="pb-activities-tabview"
                onMouseDown={(e) => e.stopPropagation()}
            />
            <Tab
                itemID="pb-activities-explorer-tab"
                aria-label={i18n.translate('explorer')}
                className="pb-activities-tablist-tab"
                id={Activity.Explorer}
                title={
                    <Icon
                        htmlTitle={i18n.translate('explorer')}
                        icon={<MdFolderRounded />}
                    />
                }
                panel={<Explorer />}
                panelClassName="pb-activities-tabview"
                onMouseDown={(e) => e.stopPropagation()}
            />
            <Tab
                itemID="pb-activities-settings-tab"
                aria-label={i18n.translate('settings')}
                className="pb-activities-tablist-tab"
                id={Activity.Settings}
                title={
                    <Icon
                        htmlTitle={i18n.translate('settings')}
                        icon={<MdSettingsRounded />}
                    />
                }
                panel={<Settings />}
                panelClassName="pb-activities-tabview"
                onMouseDown={(e) => e.stopPropagation()}
            />
        </Tabs>
    );
};

export default Activities;
