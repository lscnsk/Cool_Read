import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Minus } from 'lucide-react';
import { CatalogSeries, CatalogBook } from '../data/catalogData';

interface CatalogSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  seriesList: CatalogSeries[];
  allBooks: CatalogBook[];
  currentFilter: {
    type: 'all' | 'series' | 'author';
    value?: string;
    searchQuery?: string;
  };
  onSelectFilter: (filter: { type: 'all' | 'series' | 'author'; value?: string; searchQuery?: string }) => void;
  appStyle?: string;
}

export const CatalogSidebar: React.FC<CatalogSidebarProps> = ({
  isOpen,
  onClose,
  seriesList,
  currentFilter,
  onSelectFilter,
  appStyle = 'Cool'
}) => {
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set(seriesList.map(s => s.name)));

  React.useEffect(() => {
    if (seriesList.length > 0) {
      setExpandedSeries(prev => {
        const next = new Set(prev);
        seriesList.forEach(s => next.add(s.name));
        return next;
      });
    }
  }, [seriesList]);

  const toggleSeriesExpand = (seriesName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSeries(prev => {
      const next = new Set(prev);
      if (next.has(seriesName)) {
        next.delete(seriesName);
      } else {
        next.add(seriesName);
      }
      return next;
    });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    onSelectFilter({
      type: 'all',
      searchQuery: query.trim() || undefined
    });
  };

  const isBimbo = appStyle === 'Bimbo';
  const isSurf = appStyle === 'Surf';
  const isMarcel = appStyle === 'Marcel';
  const isDragon = appStyle === 'Dragon';
  const isFF = appStyle === 'Final' || appStyle === 'Final Fantasy';

  const isRootActive = currentFilter.type === 'all' && !currentFilter.searchQuery;

  const getItemClass = (isActive: boolean) => {
    if (isActive) {
      if (isMarcel) return 'bg-[#E8E0F5] text-[#2F2440] shadow-sm border border-[#AC97D7]';
      if (isBimbo) return 'bg-white text-[#BE123C] shadow-sm border border-[#FBCFE8]';
      if (isSurf) return 'bg-white text-[#0C4A6E] shadow-sm border border-[#BAE6FD]';
      if (isDragon) return 'bg-[#4a2511] text-[#fcd34d] shadow-sm border border-[#991b1b]';
      if (isFF) return 'bg-[#17335e] text-[#f0deba] shadow-sm border border-[#dfc894]';
      return 'bg-[#45413e] text-[#fffff0] shadow-sm border border-[#57534e]';
    } else {
      if (isMarcel) return 'text-[#544372] hover:bg-[#E8E0F5]/50 hover:text-[#2F2440] border border-transparent';
      if (isBimbo) return 'text-[#BE123C]/70 hover:bg-white/50 hover:text-[#BE123C] border border-transparent';
      if (isSurf) return 'text-[#0369A1] hover:bg-white/50 hover:text-[#0C4A6E] border border-transparent';
      if (isDragon) return 'text-[#b45309] hover:bg-[#4a2511]/50 hover:text-[#fcd34d] border border-transparent';
      if (isFF) return 'text-[#8faada] hover:bg-[#17335e]/50 hover:text-[#f0deba] border border-transparent';
      return 'text-[#888] hover:bg-[#363330] hover:text-[#ddd] border border-transparent';
    }
  };

  const getChevronClass = (isExpanded: boolean) => {
    if (isMarcel) {
      return `hover:bg-[#E8E0F5]/60 ${isExpanded ? 'text-[#2F2440]' : 'text-[#766594]/60'}`;
    }
    if (isBimbo) {
      return `hover:bg-white/50 ${isExpanded ? 'text-[#BE123C]' : 'text-[#BE123C]/50'}`;
    }
    if (isSurf) {
      return `hover:bg-white/50 ${isExpanded ? 'text-[#0C4A6E]' : 'text-[#0369A1]/50'}`;
    }
    if (isDragon) {
      return `hover:bg-[#4a2511] ${isExpanded ? 'text-[#fcd34d]' : 'text-[#b45309]'}`;
    }
    if (isFF) {
      return `hover:bg-[#17335e] ${isExpanded ? 'text-[#dfc894]' : 'text-[#8faada]/60'}`;
    }
    return `hover:bg-[#363330] ${isExpanded ? 'text-[#fffff0]' : 'text-[#555]'}`;
  };

  const getConnectorClass = () => {
    if (isMarcel) return 'border-l border-[#C4B5E6]/70 mt-1 ml-2';
    if (isBimbo) return 'border-l border-[#FBCFE8] mt-1 ml-2';
    if (isSurf) return 'border-l border-[#BAE6FD] mt-1 ml-2';
    if (isDragon) return 'border-l border-[#7f1d1d] mt-1 ml-2';
    if (isFF) return 'border-l border-[#406da3]/60 mt-1 ml-2';
    return 'border-l border-[#45413e] mt-1 ml-2';
  };

  return (
    <div
      className={`fixed inset-y-0 right-0 z-40 w-80 max-w-full bg-[#2c2a28] border-l border-[#45413e] transform transition-transform duration-300 ease-in-out shadow-2xl flex flex-col ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      } bimbo-sidebar`}
    >
      {/* Sidebar Header - Exactly styled like ChapterSidebar */}
      <div className="border-b border-[#45413e] bg-[#23211f] shrink-0 h-20 flex justify-between items-center px-4 gap-1 relative">
        {isSearchMode ? (
          <div className="flex-1 flex items-center min-w-0 mr-1">
            <span className="text-2xl cursor-default select-none mr-2">🔍</span>
            <input
              autoFocus
              className={`flex-1 min-w-0 border rounded px-3 py-2 text-sm focus:outline-none ${
                isMarcel
                  ? 'bg-white border-[#C4B5E6] text-[#2F2440] placeholder-[#766594]/70 focus:border-[#766594]'
                  : isBimbo
                  ? 'bg-white border-[#FBCFE8] text-[#881337] placeholder-[#BE123C]/70 focus:border-[#BE123C]'
                  : isSurf
                  ? 'bg-white border-[#BAE6FD] text-[#0C4A6E] placeholder-[#0369A1]/70 focus:border-[#0284C7]'
                  : isDragon
                  ? 'bg-[#1a0f0d] border-[#7f1d1d] text-[#fcd34d] placeholder-[#b45309]/70 focus:border-[#ea580c]'
                  : isFF
                  ? 'bg-[#061124] border-[#406da3] text-[#f0deba] placeholder-[#8faada]/70 focus:border-[#dfc894]'
                  : 'bg-[#2c2a28] border-[#45413e] text-[#fffff0] placeholder-[#888] focus:border-[#57534e]'
              }`}
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLElement)?.blur();
                }
              }}
            />
          </div>
        ) : (
          <h2 className="text-xl font-bold flex items-center gap-1.5 text-[#fffff0] truncate min-w-0 flex-1">
            <span className="text-3xl leading-none shrink-0 emoji">
              🗂️
            </span>
            <span
              className={`leading-normal whitespace-nowrap ${
                isMarcel
                  ? 'font-marcel font-medium text-[26px] tracking-wide translate-y-[1px]'
                  : isBimbo
                  ? 'font-bimbo font-medium text-[26px] tracking-wide translate-y-[1px]'
                  : isSurf
                  ? 'font-surf font-medium text-[28px] tracking-wide translate-y-[1px]'
                  : isFF
                  ? 'font-ff font-semibold text-[21px] tracking-wider translate-y-[1px]'
                  : isDragon
                  ? 'font-dragon font-medium text-[22px] tracking-wide text-[#fffff0] translate-y-[1px]'
                  : 'font-literata font-bold text-[22px] tracking-wide'
              }`}
            >
              Catalog
            </span>
          </h2>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {!isSearchMode && (
            <button
              onClick={() => setIsSearchMode(true)}
              className="text-[#888] hover:text-[#fffff0] p-0.5 hover:scale-110 transition-transform shrink-0"
              title="Search"
            >
              <span className="text-2xl leading-none emoji">🔍</span>
            </button>
          )}

          <button
            onClick={() => {
              if (isSearchMode) {
                setIsSearchMode(false);
                setSearchQuery('');
                onSelectFilter({ type: 'all' });
              } else {
                onClose();
              }
            }}
            className="text-[#888] hover:text-[#fffff0] p-0.5 hover:scale-110 transition-transform shrink-0"
            title="Close"
          >
            <span className="text-2xl leading-none emoji">❌</span>
          </button>
        </div>
      </div>

      {/* Navigation Tree - Exactly styled as in ChapterSidebar */}
      <div className="flex-1 overflow-y-auto p-2 custom-scroll select-none">
        <ul className="space-y-1">
          
          {/* ROOT LEVEL: lscnsk (Replaces book title / Cover in ChapterSidebar) */}
          <li className="select-none">
            <div className="flex items-stretch gap-1">
              <button
                onClick={() => {
                  onSelectFilter({ type: 'all' });
                  onClose();
                }}
                className={`flex-1 text-left px-3 py-2 rounded-md text-sm transition-all flex items-start gap-3 overflow-hidden ${getItemClass(
                  isRootActive
                )}`}
                style={{ paddingLeft: '12px' }}
              >
                <span className={`text-xs mt-0.5 shrink-0 ${isRootActive ? 'text-[#fffff0]' : 'opacity-30'}`}>
                  {isRootActive ? "🔖" : <Minus size={10} className="mt-1" />}
                </span>
                <span
                  className={`flex-1 leading-snug line-clamp-2 break-words ${
                    isMarcel
                      ? 'font-marcel font-medium text-sm'
                      : isBimbo
                      ? 'font-bimbo font-medium text-sm'
                      : isSurf
                      ? 'font-surf font-medium text-base'
                      : isDragon
                      ? 'font-dragon font-medium text-sm'
                      : isFF
                      ? 'font-ff font-semibold text-xs tracking-wider'
                      : 'font-literata font-bold text-xs'
                  }`}
                >
                  lscnsk
                </span>
              </button>
            </div>
          </li>

          {/* LEVEL 1: SERIES */}
          {seriesList.map((series) => {
            const isSeriesActive = currentFilter.type === 'series' && currentFilter.value === series.name;
            const isExpanded = expandedSeries.has(series.name);
            const hasChildren = series.authors && series.authors.length > 0;

            return (
              <li key={series.id} className="select-none">
                <div className="flex items-stretch gap-1">
                  <button
                    onClick={() => {
                      onSelectFilter({ type: 'series', value: series.name });
                      onClose();
                    }}
                    className={`flex-1 text-left px-3 py-2 rounded-md text-sm transition-all flex items-start gap-3 overflow-hidden ${getItemClass(
                      isSeriesActive
                    )}`}
                    style={{ paddingLeft: '12px' }}
                  >
                    <span className={`text-xs mt-0.5 shrink-0 ${isSeriesActive ? 'text-[#fffff0]' : 'opacity-30'}`}>
                      {isSeriesActive ? "🔖" : <Minus size={10} className="mt-1" />}
                    </span>
                    <span className="flex-1 text-xs leading-snug line-clamp-2 break-words">
                      {series.name}
                    </span>
                  </button>

                  {hasChildren && (
                    <button
                      onClick={(e) => toggleSeriesExpand(series.name, e)}
                      className={`px-2 rounded-md flex items-center justify-center transition-colors ${getChevronClass(
                        isExpanded
                      )}`}
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  )}
                </div>

                {/* LEVEL 2: AUTHORS (Nested exactly as in ChapterSidebar) */}
                {hasChildren && isExpanded && (
                  <div className={getConnectorClass()}>
                    <ul className="space-y-1">
                      {series.authors.map((author) => {
                        const isAuthorActive = currentFilter.type === 'author' && currentFilter.value === author;
                        return (
                          <li key={author} className="select-none">
                            <div className="flex items-stretch gap-1">
                              <button
                                onClick={() => {
                                  onSelectFilter({ type: 'author', value: author });
                                  onClose();
                                }}
                                className={`flex-1 text-left px-3 py-2 rounded-md text-sm transition-all flex items-start gap-3 overflow-hidden ${getItemClass(
                                  isAuthorActive
                                )}`}
                                style={{ paddingLeft: '20px' }}
                              >
                                <span className={`text-xs mt-0.5 shrink-0 ${isAuthorActive ? 'text-[#fffff0]' : 'opacity-30'}`}>
                                  {isAuthorActive ? "🔖" : <Minus size={10} className="mt-1" />}
                                </span>
                                <span
                                  className={`flex-1 leading-snug line-clamp-2 break-words ${
                                    isMarcel
                                      ? 'font-marcel text-xs tracking-wide'
                                      : isBimbo
                                      ? 'font-bimbo text-xs tracking-wide'
                                      : isSurf
                                      ? 'font-surf text-sm tracking-wide'
                                      : isDragon
                                      ? 'font-dragon text-xs tracking-wide'
                                      : isFF
                                      ? 'font-ff text-[11px] tracking-wider'
                                      : 'font-literata italic text-xs'
                                  }`}
                                >
                                  {author}
                                </span>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
