"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSearch } from "@context/SearchContext";
import { useSearchParser } from "@hooks/useSearchParser";
import { useScrollDirection } from "@hooks/useScrollDirection";
import { useInfiniteScroll } from "@hooks/useInfiniteScroll";
import PostCard from "@ui/PostCard";
import postStyles from "@ui/PostCard/PostCard.module.scss";
import { sanitizePosts, type Post, type SanitizedPost } from "@/app/utils/sanitize";
import styles from "./WallView.module.scss";

const POSTS_PER_LOAD = 20;
const SKELETON_COUNT = 15;

export default function WallView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { inputValue, setInputValue, loading, setLoading } = useSearch();

  const [posts, setPosts] = useState<Post[]>([]);
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const [visibleEndIndex, setVisibleEndIndex] = useState(POSTS_PER_LOAD);
  const [highlightedPostId, setHighlightedPostId] = useState(0);

  const { scrollDirection } = useScrollDirection();
  const { query, queryUser, dateFilter } = useSearchParser(inputValue);

  // Track previous search state for detecting changes
  const prevSearchRef = useRef({ query: "", queryUser: "", dateFilter: null as typeof dateFilter });
  const skipPaginationResetRef = useRef(false);

  // Fetch posts
  useMemo(() => {
    fetch("/data/NFC.json")
      .then((res) => res.json())
      .then((data: Post[]) => {
        setPosts(data);
        setLoading(false);
      });
  }, []);

  // Control body overflow during loading
  useEffect(() => {
    document.body.style.overflow = loading ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [loading]);

  // Filter posts
  const filteredPosts = useMemo(() => {
    if (loading || !posts.length) return [];

    let result = posts;

    if (queryUser) {
      result = result.filter((post) =>
        post.poster?.user.username.toLowerCase().includes(queryUser.toLowerCase())
      );
    }

    if (dateFilter) {
      result = result.filter((post) => {
        const ts = new Date(post.created).getTime();
        if (isNaN(ts)) return false;
        if (dateFilter.start != null && ts < dateFilter.start) return false;
        if (dateFilter.end != null && ts >= dateFilter.end) return false;
        return true;
      });
    }

    if (query) {
      result = result.filter((post) =>
        post.body.toLowerCase().includes(query.toLowerCase())
      );
    }

    return result;
  }, [posts, query, queryUser, dateFilter, loading]);

  // Reset pagination when filters change
  useEffect(() => {
    const prev = prevSearchRef.current;
    if (
      prev.query !== query ||
      prev.queryUser !== queryUser ||
      JSON.stringify(prev.dateFilter) !== JSON.stringify(dateFilter)
    ) {
      if (skipPaginationResetRef.current) {
        skipPaginationResetRef.current = false;
      } else {
        setVisibleStartIndex(0);
        setVisibleEndIndex(POSTS_PER_LOAD);
        if (query || queryUser || dateFilter) {
          window.scrollTo(0, 0);
        }
      }
    }
    prevSearchRef.current = { query, queryUser, dateFilter };
  }, [query, queryUser, dateFilter]);

  // Sync URL with search
  useEffect(() => {
    const currentSearch = searchParams.get("search") ?? "";
    if (inputValue !== currentSearch) {
      const url = inputValue ? `/wall?search=${encodeURIComponent(inputValue)}` : "/wall";
      router.replace(url, { scroll: false });
    }
  }, [inputValue, router, searchParams]);

  const currentPagePosts = useMemo(
    () => sanitizePosts(filteredPosts.slice(visibleStartIndex, visibleEndIndex)),
    [filteredPosts, visibleStartIndex, visibleEndIndex]
  );

  const showJumpToOldest = visibleStartIndex > 0;
  const showJumpToNewest = visibleEndIndex < filteredPosts.length;
  const hasFilter = !!(queryUser || query || dateFilter);

  // Scroll position preservation ref for prepending
  const scrollHeightBeforePrepend = useRef<number | null>(null);

  const handleLoadTop = useCallback(() => {
    if (visibleStartIndex <= 0) return;
    scrollHeightBeforePrepend.current = document.documentElement.scrollHeight;
    setVisibleStartIndex((prev) => Math.max(0, prev - POSTS_PER_LOAD));
  }, [visibleStartIndex]);

  // Preserve scroll position after prepending
  useLayoutEffect(() => {
    if (scrollHeightBeforePrepend.current !== null) {
      const oldHeight = scrollHeightBeforePrepend.current;
      const newHeight = document.documentElement.scrollHeight;
      window.scrollTo(0, document.documentElement.scrollTop + (newHeight - oldHeight));
      scrollHeightBeforePrepend.current = null;
    }
  }, [visibleStartIndex]);

  const handleLoadBottom = useCallback(() => {
    setVisibleEndIndex((prev) =>
      Math.min(filteredPosts.length, prev + POSTS_PER_LOAD)
    );
  }, [filteredPosts.length]);

  const topSentinelRef = useInfiniteScroll(
    "top",
    visibleStartIndex > 0,
    handleLoadTop
  );
  const bottomSentinelRef = useInfiniteScroll(
    "bottom",
    visibleEndIndex < filteredPosts.length,
    handleLoadBottom
  );

  function jumpToOldest() {
    setVisibleStartIndex(0);
    setVisibleEndIndex(POSTS_PER_LOAD);
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
  }

  function jumpToNewest() {
    setVisibleStartIndex(Math.max(0, filteredPosts.length - POSTS_PER_LOAD));
    setVisibleEndIndex(filteredPosts.length);
    setTimeout(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth",
      });
    }, 50);
  }

  function searchUser(username: string) {
    setVisibleStartIndex(0);
    setVisibleEndIndex(POSTS_PER_LOAD);
    setLoading(true);

    const fromUserRegex = /\s*from:\s*(\S+)\s*/i;
    const fromUserString = `from:${username}`;

    if (inputValue.match(fromUserRegex)) {
      setInputValue(
        inputValue.replace(fromUserRegex, ` ${fromUserString} `).trim()
      );
    } else {
      setInputValue(`${inputValue} ${fromUserString}`.trim());
    }

    window.scrollTo(0, 0);
    setTimeout(() => setLoading(false), 100);
  }

  function gotoContext(id: number) {
    const postIndex = posts.findIndex((post) => post.id === id);
    if (postIndex === -1) return;

    const windowSize = 10;
    skipPaginationResetRef.current = true;
    setInputValue("");
    setVisibleStartIndex(Math.max(0, postIndex - windowSize));
    setVisibleEndIndex(Math.min(posts.length, postIndex + windowSize + 1));
    setHighlightedPostId(id);

    setTimeout(() => {
      const maxAttempts = 20;
      let attempt = 0;
      const interval = setInterval(() => {
        const element = document.getElementById(`post-${id}`);
        if (element) {
          clearInterval(interval);
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => {
            setHighlightedPostId((current) => (current === id ? 0 : current));
          }, 2000);
        } else if (++attempt >= maxAttempts) {
          clearInterval(interval);
        }
      }, 100);
    }, 50);
  }

  return (
    <div>
      <main className={styles.main}>
        {showJumpToOldest && !loading && (
          <button
            className={`${styles.jumpButton} ${styles["jumpButton--top"]} ${scrollDirection === "down" ? styles.hidden : ""}`}
            onClick={jumpToOldest}
          >
            Jump To Oldest
          </button>
        )}

        <div className={styles.postCount}>
          {loading || posts.length === 0 ? (
            <p>Loading</p>
          ) : filteredPosts.length === 0 ? (
            <p>No posts found</p>
          ) : filteredPosts.length === 1 ? (
            <p>Showing one single lonely post</p>
          ) : (
            <p>Showing {filteredPosts.length.toLocaleString()} posts</p>
          )}
        </div>

        {visibleStartIndex > 0 && (
          <div ref={topSentinelRef} className={styles.sentinel} />
        )}

        {loading || posts.length === 0
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <div key={i} className={`${postStyles.post} ${postStyles["post--skeleton"]}`}>
                <div
                  className={`${postStyles.post__avatar} ${postStyles["post__avatar--loading"]}`}
                />
                <div className={postStyles.post__content}>
                  <div className={postStyles["post__user-date-container"]}>
                    <div
                      className={`${postStyles.skeleton} ${postStyles["skeleton-user"]}`}
                    />
                    <div
                      className={`${postStyles.skeleton} ${postStyles["skeleton-date"]}`}
                    />
                  </div>
                  <div
                    className={`${postStyles.skeleton} ${postStyles["skeleton-body"]}`}
                  />
                </div>
              </div>
            ))
          : currentPagePosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                highlighted={post.id === highlightedPostId}
                hasFilter={hasFilter}
                onSearchUser={searchUser}
                onGotoContext={gotoContext}
              />
            ))}

        {visibleEndIndex < filteredPosts.length && (
          <div ref={bottomSentinelRef} className={styles.sentinel} />
        )}

        {showJumpToNewest && !loading && (
          <button
            className={`${styles.jumpButton} ${styles["jumpButton--bottom"]} ${scrollDirection === "up" ? styles.hidden : ""}`}
            onClick={jumpToNewest}
          >
            Jump To Newest
          </button>
        )}
      </main>
    </div>
  );
}
