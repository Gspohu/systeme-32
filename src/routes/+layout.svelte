<script lang="ts">
    import "$lib/ui/styles/tokens.css"; 
    import "$lib/ui/styles/reset.css";
    import "$lib/ui/styles/components.css";
    import "$lib/ui/styles/components_extended.css";
    import "$lib/ui/styles/components_data.css";
    import "$lib/ui/styles/app.css";

    let { children } = $props();
</script>

{@render children()}
