import type { MarketView, Me, NewsView, OrderView, PortfolioView } from "@tradetech/contracts"
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

export const usePortfolio = () =>
  useQuery({ queryKey: queryKeys.portfolio, queryFn: () => api.get<PortfolioView>("/portfolio") })

export const useNews = () => useQuery({ queryKey: queryKeys.news, queryFn: () => api.get<NewsView[]>("/news") })

export const useOrders = () => useQuery({ queryKey: queryKeys.orders, queryFn: () => api.get<OrderView[]>("/orders") })
