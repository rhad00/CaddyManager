export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 flex">
          <a className="mr-6 flex items-center space-x-2" href="/">
            <span className="font-bold">CaddyManager</span>
          </a>
        </div>
        <div className="flex flex-1 items-center justify-between space-x-2">
          <nav className="flex items-center space-x-6">{/* Add navigation items here */}</nav>
          <div className="flex items-center space-x-2">
            {/* Add user menu, theme toggle, etc. here */}
          </div>
        </div>
      </div>
    </nav>
  );
}
