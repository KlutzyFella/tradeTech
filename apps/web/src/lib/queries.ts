import type { EventRulesView, MarketView, Me, NewsView, OrderView, PortfolioView, StockHistoryView, TeamStandingsView } from "@tradetech/contracts"
import { useQuery } from "@tanstack/react-query"
import { api, ApiError } from "./api"
import { queryKeys } from "./live"

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<Me | null> => {
      try {
        return await api.get<Me>("/auth/me")
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: Infinity,
  })
}

export const useMarket = () => useQuery({ queryKey: queryKeys.market, queryFn: () => api.get<MarketView>("/market") })

export const usePortfolio = () => useQuery({ queryKey: queryKeys.portfolio, queryFn: () => api.get<PortfolioView>("/portfolio") })

export const useNews = () => useQuery({ queryKey: queryKeys.news, queryFn: () => api.get<NewsView[]>("/news") })

export const useStandings = () => useQuery({ queryKey: queryKeys.standings, queryFn: () => api.get<TeamStandingsView>("/standings"), refetchInterval: 10_000 })

export const useOrders = () => useQuery({ queryKey: queryKeys.orders, queryFn: () => api.get<OrderView[]>("/orders") })

/** A stock's price history for charts. Refreshes on market changes and every 10 s (ticker samples). */
export const useStockHistory = (stockId: string) =>
  useQuery({
    queryKey: [...queryKeys.history, stockId],
    queryFn: () => api.get<StockHistoryView>(`/stocks/${stockId}/history`),
    refetchInterval: 10_000,
  })

/** Rules change only before the event goes live; refetched whenever the explainer opens. */
export const useEventRules = (enabled: boolean) =>
  useQuery({ queryKey: queryKeys.rules, queryFn: () => api.get<EventRulesView>("/rules"), enabled, staleTime: 30_000 })
