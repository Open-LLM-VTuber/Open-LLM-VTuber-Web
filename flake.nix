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
          packages = [ pkgs.nodejs pkgs.electron ];
          # Use the NixOS-patched Electron instead of the pre-built npm binary.
          # pkgs.electron has correct RPATHs baked in, supports native Wayland
          # (ozone/Chromium), and needs no LD_LIBRARY_PATH workarounds.
          ELECTRON_OVERRIDE_DIST_PATH = "${pkgs.electron}/libexec/electron";
        };
      });
    };
}
