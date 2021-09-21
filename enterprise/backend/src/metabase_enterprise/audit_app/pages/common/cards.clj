(ns metabase-enterprise.audit-app.pages.common.cards
  (:require [metabase-enterprise.audit-app.pages.common :as common]
            [metabase.util.honeysql-extensions :as hx]))

(def avg-exec-time
  "HoneySQL for a CTE to include the average execution time for each Card."
  [:avg_exec_time {:select   [:card_id
                              [:%avg.running_time :avg_running_time_ms]]
                   :from     [:query_execution]
                   :group-by [:card_id]}])

(def avg-exec-time-45
  "HoneySQL for a CTE to include the average execution time for each Card for 45 days."
  [:avg_exec_time (-> {:select   [:card_id
                                  [:%avg.running_time :avg_running_time_ms]]
                       :from     [:query_execution]
                       :group-by [:card_id]}
                      (common/add-45-days-clause :started_at))])

(def total-exec-time-45
  "HoneySQL for a CTE to include the total execution time for each Card for 45 days."
  [:total_runtime (-> {:select   [:card_id
                                  [:%sum.running_time :total_running_time_ms]]
                       :from     [:query_execution]
                       :group-by [:card_id]}
                      (common/add-45-days-clause :started_at))])

(def latest-qe
  "HoneySQL for a CTE to get latest QueryExecution for a Card."
  [:latest_qe {:select [:id :card_id :error]
        :from [:query_execution]
        :where [:in :started_at {:select [:%max.started_at] :from [:query_execution]}]
        :group-by [:card_id :error]}])

(def query-runs
  "HoneySQL for a CTE to include the total number of queries for each Card forever."
  [:query_runs {:select   [:card_id
                           [:%count.* :count]
                           [:%max.started_at :last]]
                :from     [:query_execution]
                :group-by [:card_id]}])

(def query-runs-45
  "HoneySQL for a CTE to include the total number of queries for each Card for 45 days."
  [:query_runs (-> {:select   [:card_id
                               [:%count.* :count]]
                    :from     [:query_execution]
                    :group-by [:card_id]}
                   (common/add-45-days-clause :started_at))])

(def dashboards
  "HoneySQL for a CTE to enumerate the dashboards for a Card."
  [:dash_card {:select [:dashboard_id :card_id [:%count.* :count]]
               :from [:report_dashboardcard]
               :group-by [:card_id]}])

(def views
  "HoneySQL for a CTE to include the total view count for each Card."
  [:card_views {:select   [[:model_id :card_id]
                           [:%count.* :count]]
                :from     [:view_log]
                :where    [:= :model (hx/literal "card")]
                :group-by [:model_id]}])
