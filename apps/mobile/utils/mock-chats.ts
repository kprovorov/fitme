export interface MockChat {
  daysAgo: number;
  id: string;
  starred: boolean;
  title: string;
}

export const MOCK_CHATS: MockChat[] = [
  { daysAgo: 5, id: "1", starred: false, title: "Expo Job offer" },
  {
    daysAgo: 5,
    id: "2",
    starred: false,
    title: "Existing tools for iOS app tech stack detection",
  },
  {
    daysAgo: 7,
    id: "3",
    starred: false,
    title: "Headless iOS simulator gateway for concurrent testing",
  },
  { daysAgo: 7, id: "4", starred: true, title: "Top three.js projects" },
  { daysAgo: 7, id: "5", starred: false, title: "Austin magician review" },
  {
    daysAgo: 14,
    id: "6",
    starred: false,
    title: "Expo agent GitHub bot description",
  },
  {
    daysAgo: 14,
    id: "7",
    starred: true,
    title: "Building an iMessage bot with Claude",
  },
  {
    daysAgo: 14,
    id: "8",
    starred: false,
    title: "Conditional HMR disabling in web frameworks",
  },
  {
    daysAgo: 14,
    id: "10",
    starred: false,
    title: "Optimizing parallel git config queries",
  },
  {
    daysAgo: 21,
    id: "11",
    starred: false,
    title: "Choosing between Tailwind and StyleX",
  },
  {
    daysAgo: 28,
    id: "12",
    starred: false,
    title: "Structuring messages and timelines",
  },
  {
    daysAgo: 28,
    id: "13",
    starred: false,
    title: "SVG morphing animation between shapes",
  },
  {
    daysAgo: 30,
    id: "14",
    starred: false,
    title: "Expo navigation patterns",
  },
  {
    daysAgo: 35,
    id: "15",
    starred: false,
    title: "Debugging Expo CLI",
  },
];
