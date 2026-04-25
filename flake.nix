{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [ pkgs.nodejs ];
          LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
            pkgs.glib
            pkgs.nss
            pkgs.nspr
            pkgs.dbus
            pkgs.atk
            pkgs.at-spi2-atk
            pkgs.cups
            pkgs.libdrm
            pkgs.gtk3
            pkgs.pango
            pkgs.cairo
            pkgs.libx11
            pkgs.libxcomposite
            pkgs.libxdamage
            pkgs.libxext
            pkgs.libxfixes
            pkgs.libxrandr
            pkgs.libxcb
            pkgs.mesa
            pkgs.libgbm
            pkgs.libglvnd
            pkgs.expat
            pkgs.libxkbcommon
            pkgs.alsa-lib
            pkgs.at-spi2-core
            pkgs.gdk-pixbuf
          ];
        };
      });
    };
}
