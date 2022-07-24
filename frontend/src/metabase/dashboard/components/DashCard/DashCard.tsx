import React, { useCallback, useMemo, useRef, useState } from "react";
import cx from "classnames";
import _ from "underscore";
import { getIn } from "icepick";
import { t } from "ttag";
import { connect } from "react-redux";
import { LocationDescriptor } from "history";

import { IconProps } from "metabase/components/Icon";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import Utils from "metabase/lib/utils";

import { useOnMount } from "metabase/hooks/use-on-mount";

import { isVirtualDashCard } from "metabase/dashboard/utils";

import { mergeSettings } from "metabase/visualizations/lib/settings";
import Visualization, {
  ERROR_MESSAGE_GENERIC,
  ERROR_MESSAGE_PERMISSION,
} from "metabase/visualizations/components/Visualization";
import WithVizSettingsData from "metabase/visualizations/hoc/WithVizSettingsData";

import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";

import { getParameterValuesBySlug } from "metabase/parameters/utils/parameter-values";

import Mode from "metabase-lib/lib/Mode";
import Metadata from "metabase-lib/lib/metadata/Metadata";

import { VisualizationSettings } from "metabase-types/api/card";
import { CardId, SavedCard } from "metabase-types/types/Card";
import {
  DashboardWithCards,
  DashCard as IDashCard,
  DashCardId,
} from "metabase-types/types/Dashboard";
import { DatasetData } from "metabase-types/types/Dataset";
import {
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/types/Parameter";
import { Series } from "metabase-types/types/Visualization";
import { Dispatch } from "metabase-types/store";

import DashCardParameterMapper from "../DashCardParameterMapper";
import ClickBehaviorSidebarOverlay from "./ClickBehaviorSidebarOverlay";
import DashCardActionButtons from "./DashCardActionButtons";
import { DashCardRoot, DashboardCardActionsPanel } from "./DashCard.styled";

const DATASET_USUALLY_FAST_THRESHOLD = 15 * 1000;

// This is done to add the `getExtraDataForClick` prop.
// We need that to pass relevant data along with the clicked object.
const WrappedVisualization = WithVizSettingsData(
  connect(null, dispatch => ({ dispatch }))(Visualization),
);

type FetchCardDataOpts = {
  reload?: boolean;
  clear?: boolean;
  ignoreCache?: boolean;
};

type NavigateToNewCardFromDashboardOpts = {
  nextCard: SavedCard;
  previousCard: SavedCard;
  dashcard: IDashCard;
  objectId?: unknown;
};

type CardIsSlow = "usually-fast" | "usually-slow" | false;

interface DashCardProps {
  dashboard: DashboardWithCards;
  dashcard: IDashCard & { justAdded?: boolean };
  gridItemWidth: number;
  totalNumGridCols: number;
  dashcardData: Record<DashCardId, Record<CardId, DatasetData>>;
  slowCards: Record<CardId, boolean>;
  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  metadata: Metadata;
  mode?: Mode;

  clickBehaviorSidebarDashcard?: IDashCard | null;

  isEditing?: boolean;
  isEditingParameter?: boolean;
  isFullscreen?: boolean;
  isMobile?: boolean;
  isNightMode?: boolean;

  headerIcon?: IconProps;

  dispatch: Dispatch;
  onAddSeries: () => void;
  onRemove: () => void;
  markNewCardSeen: (dashcardId: DashCardId) => void;
  fetchCardData: (
    card: SavedCard,
    dashCard: IDashCard,
    opts?: FetchCardDataOpts,
  ) => void;
  navigateToNewCardFromDashboard?: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  showClickBehaviorSidebar: (dashCardId: DashCardId) => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

function preventDragging(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function getSeriesError(series: Series) {
  const isAccessRestricted = series.some(
    s =>
      s.error_type === SERVER_ERROR_TYPES.missingPermissions ||
      s.error?.status === 403,
  );

  if (isAccessRestricted) {
    return {
      message: ERROR_MESSAGE_PERMISSION,
      icon: "key",
    };
  }

  const errors = series.map(s => s.error).filter(Boolean);
  if (errors.length > 0) {
    if (IS_EMBED_PREVIEW) {
      const message = errors[0]?.data || ERROR_MESSAGE_GENERIC;
      return { message, icon: "warning" };
    }
    return {
      message: ERROR_MESSAGE_GENERIC,
      icon: "warning",
    };
  }

  return;
}

type VizReplacementContentProps = Pick<
  DashCardProps,
  | "dashcard"
  | "isEditingParameter"
  | "isMobile"
  | "gridItemWidth"
  | "showClickBehaviorSidebar"
> & {
  isClickBehaviorSidebarOpen: boolean;
  isEditingDashCardClickBehavior: boolean;
};

function VizReplacementContent({
  dashcard,
  isClickBehaviorSidebarOpen,
  isEditingDashCardClickBehavior,
  isMobile,
  isEditingParameter,
  gridItemWidth,
  showClickBehaviorSidebar,
}: VizReplacementContentProps) {
  if (isClickBehaviorSidebarOpen) {
    return isVirtualDashCard(dashcard) ? (
      <div className="flex full-height align-center justify-center">
        <h4 className="text-medium">{t`Text card`}</h4>
      </div>
    ) : (
      <ClickBehaviorSidebarOverlay
        dashcard={dashcard}
        dashcardWidth={gridItemWidth}
        showClickBehaviorSidebar={showClickBehaviorSidebar}
        isShowingThisClickBehaviorSidebar={isEditingDashCardClickBehavior}
      />
    );
  }

  if (isEditingParameter) {
    return <DashCardParameterMapper dashcard={dashcard} isMobile={isMobile} />;
  }

  return null;
}

function DashCard({
  dashcard,
  dashcardData,
  dashboard,
  slowCards,
  metadata,
  parameterValues,
  gridItemWidth,
  totalNumGridCols,
  mode,
  isEditing = false,
  isNightMode = false,
  isFullscreen = false,
  isMobile = false,
  isEditingParameter,
  clickBehaviorSidebarDashcard,
  headerIcon,
  onAddSeries,
  onRemove,
  navigateToNewCardFromDashboard,
  markNewCardSeen,
  showClickBehaviorSidebar,
  onChangeLocation,
  onUpdateVisualizationSettings,
  onReplaceAllVisualizationSettings,
  dispatch,
}: DashCardProps) {
  const [isPreviewingCard, setIsPreviewingCard] = useState(false);
  const cardRootRef = useRef<HTMLDivElement>(null);

  const handlePreviewToggle = useCallback(() => {
    setIsPreviewingCard(wasPreviewingCard => !wasPreviewingCard);
  }, []);

  useOnMount(() => {
    if (dashcard.justAdded) {
      cardRootRef?.current?.scrollIntoView({
        block: "nearest",
      });
      markNewCardSeen(dashcard.id);
    }
  });

  const mainCard: SavedCard = useMemo(
    () => ({
      ...dashcard.card,
      visualization_settings: mergeSettings(
        dashcard.card.visualization_settings,
        dashcard.visualization_settings,
      ),
    }),
    [dashcard],
  );

  const dashboardId = dashcard.dashboard_id;
  const isEmbed = Utils.isJWT(dashboardId);

  const cards = useMemo(() => {
    if (Array.isArray(dashcard.series)) {
      return [mainCard, ...dashcard.series];
    }
    return [mainCard];
  }, [mainCard, dashcard]);

  const series = useMemo(() => {
    return cards.map(card => ({
      ...getIn(dashcardData, [dashcard.id, card.id]),
      card: card,
      isSlow: slowCards[card.id],
      isUsuallyFast:
        card.query_average_duration &&
        card.query_average_duration < DATASET_USUALLY_FAST_THRESHOLD,
    }));
  }, [cards, dashcard.id, dashcardData, slowCards]);

  const isLoading = useMemo(() => {
    if (isVirtualDashCard(dashcard)) {
      return false;
    }
    const hasSeries = series.length > 0 && series.every(s => s.data);
    return !hasSeries;
  }, [dashcard, series]);

  const { expectedDuration, isSlow } = useMemo(() => {
    const expectedDuration = Math.max(
      ...series.map(s => s.card.query_average_duration || 0),
    );
    const isUsuallyFast = series.every(s => s.isUsuallyFast);
    let isSlow: CardIsSlow = false;
    if (isLoading && series.some(s => s.isSlow)) {
      isSlow = isUsuallyFast ? "usually-fast" : "usually-slow";
    }
    return { expectedDuration, isSlow };
  }, [series, isLoading]);

  const error = useMemo(() => getSeriesError(series), [series]);
  const hasError = !!error;

  const parameterValuesBySlug = useMemo(
    () => getParameterValuesBySlug(dashboard.parameters, parameterValues),
    [dashboard.parameters, parameterValues],
  );

  const gridSize = useMemo(
    () => ({ width: dashcard.sizeX, height: dashcard.sizeY }),
    [dashcard.sizeX, dashcard.sizeY],
  );

  const handleShowClickBehaviorSidebar = useCallback(() => {
    showClickBehaviorSidebar(dashcard.id);
  }, [dashcard.id, showClickBehaviorSidebar]);

  const changeCardAndRunHandler = useMemo(() => {
    if (!navigateToNewCardFromDashboard) {
      return null;
    }

    type Args = Omit<NavigateToNewCardFromDashboardOpts, "dashcard">;
    return ({ nextCard, previousCard, objectId }: Args) => {
      navigateToNewCardFromDashboard({
        nextCard,
        previousCard,
        dashcard,
        objectId,
      });
    };
  }, [dashcard, navigateToNewCardFromDashboard]);

  const hasHiddenBackground =
    !isEditing &&
    mainCard.visualization_settings["dashcard.background"] === false;

  const isEditingDashboardLayout =
    isEditing && !clickBehaviorSidebarDashcard && !isEditingParameter;

  const isClickBehaviorSidebarOpen = !!clickBehaviorSidebarDashcard;
  const isEditingDashCardClickBehavior =
    clickBehaviorSidebarDashcard?.id === dashcard.id;

  return (
    <DashCardRoot
      className="Card rounded flex flex-column hover-parent hover--visibility"
      hasHiddenBackground={hasHiddenBackground}
      isNightMode={isNightMode}
      isUsuallySlow={isSlow === "usually-slow"}
      ref={cardRootRef}
    >
      {isEditingDashboardLayout && (
        <DashboardCardActionsPanel onMouseDown={preventDragging}>
          <DashCardActionButtons
            dashboard={dashboard}
            series={series}
            isLoading={isLoading}
            isPreviewing={isPreviewingCard}
            isVirtualDashCard={isVirtualDashCard(dashcard)}
            hasError={hasError}
            onRemove={onRemove}
            onAddSeries={onAddSeries}
            onReplaceAllVisualizationSettings={
              onReplaceAllVisualizationSettings
            }
            showClickBehaviorSidebar={handleShowClickBehaviorSidebar}
            onPreviewToggle={handlePreviewToggle}
          />
        </DashboardCardActionsPanel>
      )}
      <WrappedVisualization
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        className={cx("flex-full overflow-hidden", {
          "pointer-events-none": isEditingDashboardLayout,
        })}
        classNameWidgets={isEmbed && "text-light text-medium-hover"}
        dashboard={dashboard}
        dashcard={dashcard}
        parameterValues={parameterValues}
        parameterValuesBySlug={parameterValuesBySlug}
        error={error?.message}
        errorIcon={error?.icon}
        headerIcon={headerIcon}
        isEditing={isEditing}
        isPreviewing={isPreviewingCard}
        isEditingParameter={isEditingParameter}
        isMobile={isMobile}
        isSlow={isSlow}
        expectedDuration={expectedDuration}
        rawSeries={series}
        showTitle
        isFullscreen={isFullscreen}
        isNightMode={isNightMode}
        isDashboard
        gridSize={gridSize}
        totalNumGridCols={totalNumGridCols}
        metadata={metadata}
        mode={mode}
        dispatch={dispatch}
        onUpdateVisualizationSettings={onUpdateVisualizationSettings}
        onChangeCardAndRun={changeCardAndRunHandler}
        onChangeLocation={onChangeLocation}
        actionButtons={
          isEmbed ? (
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            <QueryDownloadWidget
              className="m1 text-brand-hover text-light"
              classNameClose="hover-child"
              card={dashcard.card}
              params={parameterValuesBySlug}
              dashcardId={dashcard.id}
              token={dashcard.dashboard_id}
              icon="download"
            />
          ) : null
        }
        replacementContent={
          (isClickBehaviorSidebarOpen || isEditingParameter) && (
            <VizReplacementContent
              dashcard={dashcard}
              isMobile={isMobile}
              isClickBehaviorSidebarOpen={isClickBehaviorSidebarOpen}
              isEditingDashCardClickBehavior={isEditingDashCardClickBehavior}
              isEditingParameter={isEditingParameter}
              gridItemWidth={gridItemWidth}
              showClickBehaviorSidebar={showClickBehaviorSidebar}
            />
          )
        }
      />
    </DashCardRoot>
  );
}

export default DashCard;
